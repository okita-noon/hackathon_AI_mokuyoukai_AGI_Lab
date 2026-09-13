import pastSelf from "@/data/usutaku.json";
import { currentUser, saveState, withTransaction } from "@/lib/backend/db";
import { deadlineAt, validateContract } from "@/lib/backend/contract";
import { readJsonBody, RequestTooLargeError } from "@/lib/backend/request";
import { anonymousSession, jsonWithSession } from "@/lib/backend/session";
import { generateJSON, detectEngine } from "@/lib/llm";
import { validateOkanReply, validateProfile } from "@/lib/ai-validation";
import { OKAN_CHARACTER, PROFILE_PROMPT, PROMISE_PROMPT, SCOLD_PROMPT } from "@/lib/prompts";
import { demoProfile, demoPromiseReply, demoScold } from "@/lib/demo";
import type { AppState, PastSelf } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Body = { mode?: unknown; extra?: unknown; promise?: unknown };
const MAX_BODY_BYTES = 16 * 1024;

function flatten(data: PastSelf, extra?: string) {
  const lines = data.sources.flatMap((source) =>
    source.items.map((item) => `[${source.label}] ${item.date} ${item.text}`),
  );
  if (extra) lines.push(`[本人が追加した情報] ${extra}`);
  return lines.join("\n");
}

export async function GET(req: Request) {
  const session = anonymousSession(req);
  try {
    const user = await currentUser(session.id);
    const state = user.ai_okan_state && Object.keys(user.ai_okan_state).length > 0 ? user.ai_okan_state : null;
    return jsonWithSession(session, { engine: detectEngine(), state });
  } catch (error) {
    console.error("[okan:get]", error);
    return jsonWithSession(session, { engine: detectEngine(), state: null, persisted: false });
  }
}

export async function POST(req: Request) {
  const session = anonymousSession(req);
  let body: Body | null;
  try {
    body = await readJsonBody(req, MAX_BODY_BYTES) as Body | null;
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      return jsonWithSession(session, { error: "リクエストが大きすぎます" }, { status: 413 });
    }
    throw error;
  }
  if (!body || !["profile", "promise", "scold"].includes(String(body.mode))) {
    return jsonWithSession(session, { error: "mode が不正です" }, { status: 400 });
  }

  if (body.mode === "profile") {
    const extra = typeof body.extra === "string" ? body.extra.trim() : "";
    if (extra.length > 2_000) return jsonWithSession(session, { error: "補足は2000文字以内です" }, { status: 400 });
    const prompt = `${PROFILE_PROMPT}\n\n---- 過去データ ----\n${flatten(pastSelf as PastSelf, extra)}`;
    const result = await generateJSON({ system: OKAN_CHARACTER, user: prompt }, validateProfile);
    const profile = result?.data ?? demoProfile;
    const engine = result?.engine ?? "demo";
    try {
      const user = await currentUser(session.id);
      const state: Partial<AppState> = { step: 2, profile, engine, contract: null, promiseReply: null, promiseEngine: null };
      await saveState(user.id, state);
      return jsonWithSession(session, { profile, engine, state });
    } catch (error) {
      console.error("[okan:profile]", error);
      return jsonWithSession(session, { profile, engine, state: null, persisted: false });
    }
  }

  const contract = validateContract(body.promise);
  if (!contract) return jsonWithSession(session, { error: "約束の内容が不正です" }, { status: 400 });

  if (body.mode === "promise") {
    const prompt = `${PROMISE_PROMPT}\n\n---- 本人の宣言 ----\n目標: ${contract.goal}\n期限: ${contract.deadline}\nエビデンス: ${contract.evidence}\n罰金: ${contract.penalty}円\n\n---- 参考: 本人の過去 ----\n${flatten(pastSelf as PastSelf)}`;
    const result = await generateJSON({ system: OKAN_CHARACTER, user: prompt }, validateOkanReply);
    const okan = result?.data?.okan ?? demoPromiseReply;
    const engine = result?.engine ?? "demo";
    try {
      const response = await withTransaction(async (client) => {
        const user = await currentUser(session.id, client);
        await client.query(
          `UPDATE commitments SET status='CANCELED', updated_at=now()
           WHERE user_id=$1 AND status IN ('ACTIVE','SUBMITTED','GRACE','UNDER_REVIEW')`,
          [user.id],
        );
        const created = await client.query(
          `INSERT INTO commitments
             (user_id, title, verification_rule, penalty_amount, deadline_at, recommended_evidence_type)
           VALUES ($1,$2,$3,$4,$5,'photo') RETURNING id, deadline_at`,
          [user.id, contract.goal, contract.evidence, contract.penalty, deadlineAt(contract.deadline)],
        );
        const savedContract = { ...contract, id: created.rows[0].id as string, deadlineAt: new Date(created.rows[0].deadline_at).toISOString() };
        const state: Partial<AppState> = {
          ...(user.ai_okan_state ?? {}), step: 4, contract: savedContract,
          promiseReply: okan, promiseEngine: engine,
        };
        await saveState(user.id, state, client);
        return { state, contract: savedContract };
      });
      return jsonWithSession(session, { okan, engine, ...response });
    } catch (error) {
      console.error("[okan:promise]", error);
      const local = { ...contract, id: null, deadlineAt: deadlineAt(contract.deadline).toISOString() };
      return jsonWithSession(session, { okan, engine, contract: local, state: null, persisted: false });
    }
  }

  const prompt = `${SCOLD_PROMPT}\n\n---- 果たせなかった約束 ----\n目標: ${contract.goal}\n期限: ${contract.deadline}\n罰金: ${contract.penalty}円\n\n---- 本人の過去の挫折歴 ----\n${flatten(pastSelf as PastSelf)}`;
  const result = await generateJSON(
    { system: OKAN_CHARACTER, user: prompt },
    (value) => validateOkanReply(value, 150),
  );
  const okan = result?.data?.okan ?? demoScold;
  const engine = result?.engine ?? "demo";
  try {
    await withTransaction(async (client) => {
      const user = await currentUser(session.id, client);
      if (!contract.id) throw new Error("commitment id is required");
      const updated = await client.query(
        `UPDATE commitments SET status='PENALIZED', updated_at=now()
         WHERE id=$1 AND user_id=$2 AND status IN ('ACTIVE','GRACE') RETURNING id, penalty_amount`,
        [contract.id, user.id],
      );
      if (updated.rowCount !== 1) throw new Error("active commitment not found");
      await client.query(
        `INSERT INTO penalty_transactions (commitment_id, amount, currency, status, idempotency_key)
         VALUES ($1,$2,'jpy','MOCKED',$3) ON CONFLICT (idempotency_key) DO NOTHING`,
        [contract.id, updated.rows[0].penalty_amount, `ai-okan-${contract.id}`],
      );
      const state = (await client.query(
        `SELECT ai_okan_state FROM users WHERE id=$1`,
        [user.id],
      )).rows[0]?.ai_okan_state ?? {};
      await saveState(user.id, {
        ...state,
        contract: { ...(state.contract ?? contract), status: "PENALIZED" },
      }, client);
    });
    return jsonWithSession(session, { okan, engine, persisted: true });
  } catch (error) {
    console.error("[okan:scold]", error);
    return jsonWithSession(session, { okan, engine, persisted: false });
  }
}

export async function DELETE(req: Request) {
  const session = anonymousSession(req);
  try {
    await withTransaction(async (client) => {
      const user = await currentUser(session.id, client);
      await client.query(
        `UPDATE commitments SET status='CANCELED', updated_at=now()
         WHERE user_id=$1 AND status IN ('ACTIVE','SUBMITTED','GRACE','UNDER_REVIEW')`,
        [user.id],
      );
      await saveState(user.id, {}, client);
    });
    return jsonWithSession(session, { ok: true });
  } catch (error) {
    console.error("[okan:delete]", error);
    return jsonWithSession(session, { ok: true, persisted: false });
  }
}
