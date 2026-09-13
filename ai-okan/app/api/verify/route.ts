import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser, pool, saveState, withTransaction } from "@/lib/backend/db";
import { validateContract } from "@/lib/backend/contract";
import { client, generateJSON, detectEngine, type MediaInput } from "@/lib/llm";
import { OKAN_CHARACTER, JUDGE_PROMPT, VERDICT_SCHEMA } from "@/lib/prompts";
import { analysisFps, resolveFilesApiVideo, type MediaSource } from "@/lib/media";
import {
  MAX_ANALYZED_SECONDS,
  MAX_VIDEO_BYTES,
  analyzedSeconds,
  formatBytes,
  formatDuration,
  requiredCount,
  type MediaMeta,
} from "@/lib/media-rules";
import { deleteObject, isOwnObject, statObject } from "@/lib/storage";
import { normalizeVerdict } from "@/lib/verdict";
import { demoVerdictFor } from "@/lib/demo";
import type { AppState, Verdict } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 動画は「アップロード確認 → Gemini の前処理 → 解析」と段階が多い
export const maxDuration = 300;

const MAX_BASE64_CHARS = 16 * 1024 * 1024;

type Body = {
  video?: unknown;
  frames?: unknown;
  promise?: unknown;
  /** GCSへ直接アップロードされた動画 */
  storageUri?: unknown;
  /** GCSが無い環境で Files API に上げた動画（files/xxxx） */
  fileName?: unknown;
  mimeType?: unknown;
  mediaMeta?: unknown;
};

function mediaInput(value: unknown): MediaInput | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.mimeType !== "string" || !/^(image|video)\//.test(item.mimeType)) return null;
  if (typeof item.base64 !== "string" || !item.base64 || item.base64.length > MAX_BASE64_CHARS) return null;
  return { mimeType: item.mimeType, base64: item.base64 };
}

/** ブラウザ由来の値なので、数値であることだけを保証して取り込む */
function mediaMeta(value: unknown): MediaMeta {
  const input = (value ?? {}) as Record<string, unknown>;
  const num = (v: unknown, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(n, max) : null;
  };
  return {
    durationSec: num(input.durationSec, 24 * 3600),
    width: num(input.width, 100_000),
    height: num(input.height, 100_000),
    sizeBytes: num(input.sizeBytes, MAX_VIDEO_BYTES),
  };
}

/** DBがあるときだけ保存済みの約束を返す。DBに繋がらない場合は null */
async function loadCommitment(id: string) {
  try {
    const user = await currentUser();
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
    return null;
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const contract = validateContract(body?.promise);
  if (!contract) return NextResponse.json({ error: "約束の内容が不正です" }, { status: 400 });

  // 動画は署名付きURL（GCS）か Files API 経由で届き、ここにはURIだけが来る
  const storageUri = typeof body?.storageUri === "string" ? body.storageUri : null;
  const fileName = typeof body?.fileName === "string" && /^files\/[a-z0-9-]{1,64}$/i.test(body.fileName)
    ? body.fileName
    : null;
  const uploadedMime = typeof body?.mimeType === "string" ? body.mimeType : null;
  const meta = mediaMeta(body?.mediaMeta);

  const video = mediaInput(body?.video);
  const frames = Array.isArray(body?.frames)
    ? body.frames.map(mediaInput).filter((item): item is MediaInput => !!item).slice(0, 3)
    : [];
  const inlineSize = (video?.base64.length ?? 0) + frames.reduce((sum, item) => sum + item.base64.length, 0);

  if (storageUri && (!isOwnObject(storageUri) || !uploadedMime?.startsWith("video/"))) {
    return NextResponse.json({ error: "アップロード先が不正です" }, { status: 400 });
  }
  if (!storageUri && !fileName && !video && frames.length === 0) {
    return NextResponse.json({ error: "写真または動画を選んでください" }, { status: 400 });
  }
  if (!storageUri && inlineSize > MAX_BASE64_CHARS) {
    return NextResponse.json({ error: "この動画は大きすぎます。短く撮り直してください" }, { status: 413 });
  }

  try {
    // GCSに上がっているはずのものが無い＝アップロード未完了。見ないまま判定しない
    let remoteHash: string | null = null;
    if (storageUri) {
      const remote = await statObject(storageUri);
      if (!remote || remote.sizeBytes === 0) {
        return NextResponse.json(
          { error: "アップロードが終わっていません。通信状況を確かめて、もう一度出してください" },
          { status: 400 },
        );
      }
      if (remote.sizeBytes > MAX_VIDEO_BYTES) {
        return NextResponse.json(
          { error: `動画が大きすぎます（${formatBytes(remote.sizeBytes)}）。${formatBytes(MAX_VIDEO_BYTES)} 以内で撮り直してください` },
          { status: 413 },
        );
      }
      remoteHash = remote.md5;
      meta.sizeBytes = remote.sizeBytes;
    }

    // DBがあれば保存済みの約束を正とし、無ければ画面から渡された約束をそのまま使う
    const saved = contract.id ? await loadCommitment(contract.id) : null;
    if (saved === "missing") return NextResponse.json({ error: "約束が見つかりません" }, { status: 404 });
    if (saved === "closed") {
      return NextResponse.json({ error: "この約束への提出は終了しています" }, { status: 409 });
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
    const googleEngine = engine === "vertex" || engine === "gemini";

    // Files API に上げた動画は、URIとハッシュをサーバー側で引き直す（クライアントの申告を信用しない）
    let filesApiHash: string | null = null;
    let filesApiSource: MediaSource | null = null;
    if (fileName && engine === "gemini") {
      const file = await resolveFilesApiVideo(client(engine), fileName);
      filesApiHash = file.hash;
      filesApiSource = { mimeType: file.mimeType, fileUri: file.fileUri, meta };
      if (file.sizeBytes) meta.sizeBytes = file.sizeBytes;
    }

    // OpenAI は動画を受け取れないので、ブラウザで抜いた連続フレームで代替する
    const sources: MediaSource[] = filesApiSource
      ? [filesApiSource]
      : storageUri && googleEngine
        ? [{ mimeType: uploadedMime!, storageUri, meta }]
        : video && googleEngine
          ? [{ mimeType: video.mimeType, base64: video.base64, meta }]
          : [];
    const inline = sources.length ? [] : frames;

    // 動画を読めないエンジンで、代わりのフレームも無い場合だけ手詰まり
    if (!sources.length && inline.length === 0 && engine !== "demo") {
      return NextResponse.json({ error: "この構成では動画を判定できません" }, { status: 400 });
    }

    const required = requiredCount(`${target.goal} ${target.evidence}`);
    const isVideoSubmission = Boolean(storageUri || fileName || video);
    const kind = describe(isVideoSubmission, sources.length > 0, frames.length, meta);
    const prompt = `${JUDGE_PROMPT}

---- 提出されたもの ----
${kind}

---- 本人が結んだ約束 ----
目標: ${target.goal}
提出すべきエビデンス: ${target.evidence}
${required !== null ? `約束した回数: ${required}回（この回数に届かなければ ng）` : "回数の指定: なし"}
期限: ${target.deadline}
守れなかった場合の罰金: ${target.penalty}円`;

    const generated = await generateJSON<Verdict>({
      system: OKAN_CHARACTER,
      user: prompt,
      media: inline,
      sources,
      schema: VERDICT_SCHEMA as unknown as Record<string, unknown>,
      // 回数を数える判定は取りこぼしが致命的なので、JUDGE_MODEL で上位モデルに寄せられるようにする
      model: process.env.JUDGE_MODEL,
    });

    // AIを呼べる設定なのに失敗したときは、作り話の判定を返さずエラーにする
    if (!generated.data && generated.engine !== "demo") {
      return NextResponse.json(
        { error: `${generated.error ?? "判定できませんでした"}。もう一度出してください` },
        { status: 502 },
      );
    }

    let verdict = normalizeVerdict(generated.data ?? demoVerdictFor(inlineSize + (meta.sizeBytes ?? 0)), required);
    const engineLabel = generated.data ? generated.engine : "demo";

    if (!saved) {
      // DBを使わない経路。判定は返すが、記録は残らない
      return NextResponse.json({ ...verdict, engine: engineLabel, analyzed: kind, persisted: false });
    }

    try {
      const user = await currentUser();
      const inlineSeed = video ?? frames[0];
      const hash = remoteHash ?? filesApiHash
        ?? createHash("sha256").update(inlineSeed?.base64 ?? storageUri ?? "").digest("hex");
      const duplicate = await pool.query(
        `SELECT 1 FROM proof_submissions p JOIN commitments c ON c.id=p.commitment_id
         WHERE c.user_id=$1 AND p.content_sha256=$2 AND p.commitment_id<>$3 LIMIT 1`,
        [user.id, hash, contract.id],
      );
      if (duplicate.rowCount && verdict.verdict === "ok") {
        verdict = { ...verdict, verdict: "suspicious", score: Math.min(verdict.score, 40), okan: "前にも同じ証拠を出してるやろ。撮り直して出しや。" };
      }

      const mimeType = filesApiSource?.mimeType ?? uploadedMime ?? video?.mimeType ?? frames[0]?.mimeType ?? "image/jpeg";
      await withTransaction(async (tx) => {
        const proof = await tx.query(
          `INSERT INTO proof_submissions
             (commitment_id, storage_uri, mime_type, evidence_type, content_sha256, hash_source, media_meta)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [
            // エビデンス本体は保存しない。これは「何を見たか」を後から辿るための印
            contract.id, `${remoteHash ? "deleted" : "inline"}://${hash}`, mimeType,
            isVideoSubmission ? "video" : "photo", hash,
            remoteHash ? "gcs-md5" : filesApiHash ? "files-api-sha256" : "sha256",
            JSON.stringify({ ...meta, analyzed: kind, counted: verdict.counted ?? null }),
          ],
        );
        const status = verdict.verdict === "ok" ? "APPROVED" : verdict.verdict === "ng" ? "REJECTED" : "UNCERTAIN";
        await tx.query(
          `INSERT INTO judgement_logs
             (commitment_id, proof_submission_id, status, confidence_score, reasoning,
              suspicious_indicators, appeal_recommended, model, raw_response)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [contract.id, proof.rows[0].id, status, verdict.score / 100, verdict.whatISee,
            duplicate.rowCount ? ["duplicate_hash_match"] : [], status !== "APPROVED",
            engineLabel, JSON.stringify(verdict)],
        );
        if (status === "APPROVED") {
          await tx.query(`UPDATE commitments SET status='APPROVED', updated_at=now() WHERE id=$1`, [contract.id]);
          await tx.query(`UPDATE users SET trust_score=LEAST(1, trust_score+0.05) WHERE id=$1`, [user.id]);
        } else {
          await tx.query(
            `UPDATE commitments SET status='GRACE', grace_expires_at=now()+interval '24 hours', updated_at=now() WHERE id=$1`,
            [contract.id],
          );
        }
        const state = (await tx.query(`SELECT ai_okan_state FROM users WHERE id=$1`, [user.id])).rows[0]?.ai_okan_state ?? {};
        const next: Partial<AppState> = { ...state, contract: { ...(state.contract ?? contract), status } };
        await saveState(user.id, next, tx);
      });

      return NextResponse.json({ ...verdict, engine: engineLabel, analyzed: kind, persisted: true });
    } catch (error) {
      // 判定はできているので、保存に失敗しても結果は返す
      console.error("[verify:persist]", error);
      return NextResponse.json({ ...verdict, engine: engineLabel, analyzed: kind, persisted: false });
    }
  } catch (error) {
    console.error("[verify]", error);
    return NextResponse.json({ error: "証拠を判定できませんでした。もう一度出してください" }, { status: 503 });
  } finally {
    // エビデンス本体は残さない。判定に使い終わったら消す
    if (storageUri) await deleteObject(storageUri);
  }
}

/** 画面と判定プロンプトの両方に出す「実際に何を解析したか」 */
function describe(isVideo: boolean, asVideo: boolean, frameCount: number, meta: MediaMeta): string {
  if (!isVideo) return "写真1枚";
  if (!asVideo) return `動画から抜き出した連続フレーム${frameCount}枚（時系列順）`;
  const { seconds, truncated } = analyzedSeconds(meta.durationSec);
  const range = truncated
    ? `先頭${MAX_ANALYZED_SECONDS / 60}分のみ（動画はこれより長い。解析範囲外を根拠に判断しないこと）`
    : seconds
      ? `全編${seconds}秒`
      : "全編";
  return `動画そのもの（${formatDuration(meta.durationSec)} / ${range} / ${analysisFps(meta)}コマ per 秒でサンプリング）`;
}
