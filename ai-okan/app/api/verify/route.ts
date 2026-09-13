import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser, pool, saveState, withTransaction } from "@/lib/backend/db";
import { validateContract } from "@/lib/backend/contract";
import { generateJSON, detectEngine, type MediaInput } from "@/lib/llm";
import { OKAN_CHARACTER, JUDGE_PROMPT } from "@/lib/prompts";
import { demoVerdictFor } from "@/lib/demo";
import type { AppState, Verdict } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BASE64_CHARS = 16 * 1024 * 1024;

type Body = { video?: unknown; frames?: unknown; promise?: unknown };

function mediaInput(value: unknown): MediaInput | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.mimeType !== "string" || !/^(image|video)\//.test(item.mimeType)) return null;
  if (typeof item.base64 !== "string" || !item.base64 || item.base64.length > MAX_BASE64_CHARS) return null;
  return { mimeType: item.mimeType, base64: item.base64 };
}

function normalize(value: Verdict): Verdict {
  const verdict = ["ok", "ng", "suspicious"].includes(value?.verdict) ? value.verdict : "suspicious";
  return {
    verdict,
    whatISee: String(value?.whatISee ?? "判定結果を確認できませんでした").slice(0, 300),
    okan: String(value?.okan ?? "もう一回、はっきり分かる証拠を出してな。").slice(0, 500),
    score: Math.min(100, Math.max(0, Math.round(Number(value?.score) || 0))),
  };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const contract = validateContract(body?.promise);
  if (!contract?.id) return NextResponse.json({ error: "保存済みの約束が必要です" }, { status: 400 });

  const video = mediaInput(body?.video);
  const frames = Array.isArray(body?.frames)
    ? body.frames.map(mediaInput).filter((item): item is MediaInput => !!item).slice(0, 3)
    : [];
  const totalSize = (video?.base64.length ?? 0) + frames.reduce((sum, item) => sum + item.base64.length, 0);
  if ((!video && frames.length === 0) || totalSize > MAX_BASE64_CHARS) {
    return NextResponse.json({ error: "写真または8MB以下の動画を選んでください" }, { status: 413 });
  }

  try {
    const user = await currentUser();
    const stored = await pool.query(
      `SELECT id, title, verification_rule, penalty_amount, deadline_at, status
       FROM commitments WHERE id=$1 AND user_id=$2`,
      [contract.id, user.id],
    );
    const commitment = stored.rows[0];
    if (!commitment) return NextResponse.json({ error: "約束が見つかりません" }, { status: 404 });
    if (!["ACTIVE", "GRACE"].includes(commitment.status)) {
      return NextResponse.json({ error: "この約束への提出は終了しています" }, { status: 409 });
    }

    const engine = detectEngine();
    const useVideo = (engine === "vertex" || engine === "gemini") && !!video;
    const media = useVideo ? [video] : frames;
    const kind = useVideo
      ? "動画そのもの"
      : frames.length > 1
        ? `動画から抜き出した連続フレーム${frames.length}枚（時系列順）`
        : "写真1枚";
    const prompt = `${JUDGE_PROMPT}\n\n---- 提出されたもの ----\n${kind}\n\n---- DBに保存された約束 ----\n目標: ${commitment.title}\n提出すべきエビデンス: ${commitment.verification_rule}\n期限: ${new Date(commitment.deadline_at).toISOString()}\n守れなかった場合の罰金: ${commitment.penalty_amount}円`;
    const generated = await generateJSON<Verdict>({ system: OKAN_CHARACTER, user: prompt, media });
    let verdict = normalize(generated?.data ?? demoVerdictFor(totalSize));
    const submitted = video ?? frames[0];
    const hash = createHash("sha256").update(submitted.base64).digest("hex");
    const duplicate = await pool.query(
      `SELECT 1 FROM proof_submissions p JOIN commitments c ON c.id=p.commitment_id
       WHERE c.user_id=$1 AND p.content_sha256=$2 AND p.commitment_id<>$3 LIMIT 1`,
      [user.id, hash, contract.id],
    );
    if (duplicate.rowCount && verdict.verdict === "ok") {
      verdict = { ...verdict, verdict: "suspicious", score: Math.min(verdict.score, 40), okan: "前にも同じ証拠を出してるやろ。撮り直して出しや。" };
    }

    await withTransaction(async (client) => {
      const proof = await client.query(
        `INSERT INTO proof_submissions
           (commitment_id, storage_uri, mime_type, evidence_type, content_sha256, hash_source)
         VALUES ($1,$2,$3,$4,$5,'sha256') RETURNING id`,
        [contract.id, `inline://${hash}`, submitted.mimeType, video ? "video" : "photo", hash],
      );
      const status = verdict.verdict === "ok" ? "APPROVED" : verdict.verdict === "ng" ? "REJECTED" : "UNCERTAIN";
      await client.query(
        `INSERT INTO judgement_logs
           (commitment_id, proof_submission_id, status, confidence_score, reasoning,
            suspicious_indicators, appeal_recommended, model, raw_response)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [contract.id, proof.rows[0].id, status, verdict.score / 100, verdict.whatISee,
          duplicate.rowCount ? ["duplicate_hash_match"] : [], status !== "APPROVED",
          generated?.engine ?? "demo", JSON.stringify(verdict)],
      );
      if (status === "APPROVED") {
        await client.query(`UPDATE commitments SET status='APPROVED', updated_at=now() WHERE id=$1`, [contract.id]);
        await client.query(`UPDATE users SET trust_score=LEAST(1, trust_score+0.05) WHERE id=$1`, [user.id]);
      } else {
        await client.query(
          `UPDATE commitments SET status='GRACE', grace_expires_at=now()+interval '24 hours', updated_at=now() WHERE id=$1`,
          [contract.id],
        );
      }
      const state = (await client.query(`SELECT ai_okan_state FROM users WHERE id=$1`, [user.id])).rows[0]?.ai_okan_state ?? {};
      const next: Partial<AppState> = { ...state, contract: { ...(state.contract ?? contract), status } };
      await saveState(user.id, next, client);
    });

    return NextResponse.json({ ...verdict, engine: generated?.engine ?? "demo", analyzed: kind, persisted: true });
  } catch (error) {
    console.error("[verify]", error);
    return NextResponse.json({ error: "判定結果を保存できませんでした" }, { status: 503 });
  }
}
