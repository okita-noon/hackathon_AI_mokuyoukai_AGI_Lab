import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { currentUser, pool, saveState, withTransaction } from "@/lib/backend/db";
import { validateContract } from "@/lib/backend/contract";
import { readJsonBody, RequestTooLargeError } from "@/lib/backend/request";
import { anonymousSession, jsonWithSession } from "@/lib/backend/session";
import { generateJSON, detectEngine, type MediaInput } from "@/lib/llm";
import { validateVerdict } from "@/lib/ai-validation";
import { OKAN_CHARACTER, JUDGE_PROMPT } from "@/lib/prompts";
import { demoVerdictFor } from "@/lib/demo";
import type { AppState, Engine, Promise as Contract, Verdict } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BASE64_CHARS = 16 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_BASE64_CHARS + 64 * 1024;

type Body = { video?: unknown; frames?: unknown; promise?: unknown };

function mediaInput(value: unknown, kind: "image" | "video"): MediaInput | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const allowed = kind === "image"
    ? /^(image\/(jpeg|png|webp|gif))$/
    : /^(video\/(mp4|webm|quicktime))$/;
  if (typeof item.mimeType !== "string" || !allowed.test(item.mimeType.toLowerCase())) return null;
  if (typeof item.base64 !== "string" || !item.base64 || item.base64.length > MAX_BASE64_CHARS) return null;
  if (item.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(item.base64)) return null;
  return { mimeType: item.mimeType.toLowerCase(), base64: item.base64 };
}

/** DBがあるときだけ保存済みの約束を返す。DBに繋がらない場合は null */
async function loadCommitment(id: string, sessionId: string) {
  try {
    const user = await currentUser(sessionId);
    const stored = await pool.query(
      `SELECT id, title, verification_rule, penalty_amount, deadline_at, status
       FROM commitments WHERE id=$1 AND user_id=$2`,
      [id, user.id],
    );
    const commitment = stored.rows[0];
    if (!commitment) return "missing" as const;
    if (!["ACTIVE", "GRACE"].includes(commitment.status)) return "closed" as const;
    return commitment as Record<string, unknown>;
  } catch (error) {
    console.error("[verify:load]", error);
    return "unavailable" as const;
  }
}

type PersistenceArgs = {
  userId: string;
  commitmentId: string;
  hash: string;
  submitted: MediaInput;
  evidenceType: "video" | "photo";
  verdict: Verdict;
  engine: Engine;
  contract: Contract;
};

export async function persistVerifiedSubmission(client: PoolClient, args: PersistenceArgs) {
  const owner = await client.query(`SELECT id FROM users WHERE id=$1 FOR UPDATE`, [args.userId]);
  if (!owner.rows[0]) return { outcome: "missing" as const, verdict: args.verdict };
  const locked = await client.query(
    `SELECT status FROM commitments WHERE id=$1 AND user_id=$2 FOR UPDATE`,
    [args.commitmentId, args.userId],
  );
  if (!locked.rows[0]) return { outcome: "missing" as const, verdict: args.verdict };
  if (!["ACTIVE", "GRACE"].includes(locked.rows[0].status)) {
    return { outcome: "closed" as const, verdict: args.verdict };
  }

  const duplicate = await client.query(
    `SELECT 1 FROM proof_submissions p JOIN commitments c ON c.id=p.commitment_id
     WHERE c.user_id=$1 AND p.content_sha256=$2 AND p.commitment_id<>$3 LIMIT 1`,
    [args.userId, args.hash, args.commitmentId],
  );
  let verdict = args.verdict;
  if (duplicate.rowCount && verdict.verdict === "ok") {
    verdict = {
      ...verdict,
      verdict: "suspicious",
      score: Math.min(verdict.score, 40),
      okan: "前にも同じ証拠を出してるやろ。撮り直して出しや。",
    };
  }
  const judgementStatus = verdict.verdict === "ok" ? "APPROVED" : verdict.verdict === "ng" ? "REJECTED" : "UNCERTAIN";
  const commitmentStatus = judgementStatus === "APPROVED" ? "APPROVED" : "GRACE";
  const updated = await client.query(
    `UPDATE commitments
     SET status=$3::commitment_status, grace_expires_at=CASE WHEN $3::commitment_status='GRACE' THEN now()+interval '24 hours' ELSE NULL END,
         updated_at=now()
     WHERE id=$1 AND user_id=$2 AND status IN ('ACTIVE','GRACE') RETURNING id`,
    [args.commitmentId, args.userId, commitmentStatus],
  );
  if (updated.rowCount !== 1) return { outcome: "closed" as const, verdict };

  const proof = await client.query(
    `INSERT INTO proof_submissions
       (commitment_id, storage_uri, mime_type, evidence_type, content_sha256, hash_source)
     VALUES ($1,$2,$3,$4,$5,'sha256') RETURNING id`,
    [args.commitmentId, `inline://${args.hash}`, args.submitted.mimeType, args.evidenceType, args.hash],
  );
  await client.query(
    `INSERT INTO judgement_logs
       (commitment_id, proof_submission_id, status, confidence_score, reasoning,
        suspicious_indicators, appeal_recommended, model, raw_response)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [args.commitmentId, proof.rows[0].id, judgementStatus, verdict.score / 100, verdict.whatISee,
      duplicate.rowCount ? ["duplicate_hash_match"] : [], judgementStatus !== "APPROVED",
      args.engine, JSON.stringify(verdict)],
  );
  if (judgementStatus === "APPROVED") {
    await client.query(`UPDATE users SET trust_score=LEAST(1, trust_score+0.05) WHERE id=$1`, [args.userId]);
  }
  const state = (await client.query(`SELECT ai_okan_state FROM users WHERE id=$1`, [args.userId])).rows[0]?.ai_okan_state ?? {};
  const next: Partial<AppState> = { ...state, contract: { ...(state.contract ?? args.contract), status: judgementStatus } };
  await saveState(args.userId, next, client);
  return { outcome: "saved" as const, verdict };
}

export async function POST(req: Request) {
  const session = anonymousSession(req);
  let body: Body | null;
  try {
    body = await readJsonBody(req, MAX_BODY_BYTES) as Body | null;
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      return jsonWithSession(session, { error: "提出データが大きすぎます" }, { status: 413 });
    }
    throw error;
  }
  const contract = validateContract(body?.promise);
  if (!contract) return jsonWithSession(session, { error: "約束の内容が不正です" }, { status: 400 });

  if (body?.video !== undefined && !mediaInput(body.video, "video")) {
    return jsonWithSession(session, { error: "動画データの形式が不正です" }, { status: 400 });
  }
  if (body?.frames !== undefined && (!Array.isArray(body.frames) || body.frames.length > 3)) {
    return jsonWithSession(session, { error: "画像は3枚以内にしてください" }, { status: 400 });
  }
  const video = body?.video === undefined ? null : mediaInput(body.video, "video");
  const frames = Array.isArray(body?.frames)
    ? body.frames.map((item) => mediaInput(item, "image"))
    : [];
  if (frames.some((item) => !item)) {
    return jsonWithSession(session, { error: "画像データの形式が不正です" }, { status: 400 });
  }
  const validFrames = frames as MediaInput[];
  const totalSize = (video?.base64.length ?? 0) + validFrames.reduce((sum, item) => sum + item.base64.length, 0);
  if ((!video && validFrames.length === 0) || totalSize > MAX_BASE64_CHARS) {
    return jsonWithSession(session, { error: "写真または8MB以下の動画を選んでください" }, { status: 413 });
  }

  // DBがあれば保存済みの約束を正とし、無ければ画面から渡された約束をそのまま使う
  const saved = contract.id ? await loadCommitment(contract.id, session.id) : null;
  if (saved === "missing") return jsonWithSession(session, { error: "約束が見つかりません" }, { status: 404 });
  if (saved === "closed") {
    return jsonWithSession(session, { error: "この約束への提出は終了しています" }, { status: 409 });
  }
  if (saved === "unavailable") {
    return jsonWithSession(session, { error: "保存済みの約束を確認できません" }, { status: 503 });
  }
  const target = saved
    ? {
        goal: saved.title as string,
        evidence: saved.verification_rule as string,
        deadline: new Date(saved.deadline_at as string).toISOString(),
        penalty: saved.penalty_amount as number,
      }
    : { goal: contract.goal, evidence: contract.evidence, deadline: contract.deadline, penalty: contract.penalty };

  const engine = detectEngine();
  const useVideo = (engine === "vertex" || engine === "gemini") && !!video;
  const media = useVideo ? [video] : validFrames;
  const kind = useVideo
    ? "動画そのもの"
    : validFrames.length > 1
      ? `動画から抜き出した連続フレーム${validFrames.length}枚（時系列順）`
      : "写真1枚";
  const prompt = `${JUDGE_PROMPT}\n\n---- 提出されたもの ----\n${kind}\n\n---- 本人が結んだ約束 ----\n目標: ${target.goal}\n提出すべきエビデンス: ${target.evidence}\n期限: ${target.deadline}\n守れなかった場合の罰金: ${target.penalty}円`;
  const generated = await generateJSON({ system: OKAN_CHARACTER, user: prompt, media }, validateVerdict);
  let verdict: Verdict = generated?.data ?? demoVerdictFor(totalSize);
  const submitted = (video ?? validFrames[0])!;

  if (!saved) {
    // DBを使わない経路。判定は返すが、記録は残らない
    return jsonWithSession(session, {
      ...verdict,
      engine: generated?.engine ?? "demo",
      analyzed: kind,
      persisted: false,
    });
  }

  try {
    const user = await currentUser(session.id);
    const hash = createHash("sha256").update(submitted.base64).digest("hex");
    const result = await withTransaction((client) => persistVerifiedSubmission(client, {
      userId: user.id,
      commitmentId: contract.id!,
      hash,
      submitted,
      evidenceType: video ? "video" : "photo",
      verdict,
      engine: generated?.engine ?? "demo",
      contract,
    }));
    const persistence = result.outcome;
    verdict = result.verdict;

    if (persistence === "missing") {
      return jsonWithSession(session, { error: "約束が見つかりません" }, { status: 404 });
    }
    if (persistence === "closed") {
      return jsonWithSession(session, { error: "この約束への提出は終了しています" }, { status: 409 });
    }
    return jsonWithSession(session, { ...verdict, engine: generated?.engine ?? "demo", analyzed: kind, persisted: true });
  } catch (error) {
    // 判定はできているので、保存に失敗しても結果は返す
    console.error("[verify:persist]", error);
    return jsonWithSession(session, {
      ...verdict,
      engine: generated?.engine ?? "demo",
      analyzed: kind,
      persisted: false,
    });
  }
}
