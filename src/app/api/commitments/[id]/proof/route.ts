import { NextResponse } from "next/server";
import { one, q } from "@/lib/db";
import { env } from "@/lib/env";
import { distanceMeters, isLargeMedia, readObject, sha256, statObject } from "@/lib/storage";
import { judgeProof, type EvidenceType, type Geo } from "@/lib/ai/judge";
import { MAX_EVIDENCE_BYTES, formatBytes, type MediaMeta } from "@/lib/media";

export const dynamic = "force-dynamic";
// 動画はアップロード確認 → Gemini の前処理 → 解析と段階が多く、画像より桁で時間がかかる
export const maxDuration = 300;

/**
 * 証跡提出 → Gemini 判定 → DB保存 → 猶予タイマー設定 を1リクエストで行う。
 *
 * req: { storage_uri?, mime_type?, note?, geo? }
 *   - photo/video/audio: storage_uri + mime_type が必須
 *   - gps:               geo { lat, lng, accuracy_m } が必須（ファイルなし）
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { storage_uri, mime_type, note, geo, evidence_type, media_meta } = await req.json();

  const c = await one<any>(
    `SELECT c.*, u.trust_score, u.id AS uid
       FROM commitments c JOIN users u ON u.id = c.user_id
      WHERE c.id = $1`,
    [id],
  );
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!["ACTIVE", "GRACE"].includes(c.status)) {
    return NextResponse.json({ error: `status=${c.status} では提出できません` }, { status: 409 });
  }

  // 推奨は目標作成時にAIが決めるが、実際に何で出すかはユーザーの自由。
  // 画面の選択より実物の MIME を優先する（動画を「写真」として判定させると、
  // 判定AIが動画向けの観点で見なくなるため）。ファイルがないときだけ申告を使う。
  const evidenceType: EvidenceType = mime_type?.startsWith("video/")
    ? "video"
    : mime_type?.startsWith("audio/")
      ? "audio"
      : storage_uri
        ? "photo"
        : (["photo", "video", "audio", "gps"] as const).includes(evidence_type)
          ? evidence_type
          : "gps";

  if (evidenceType === "gps") {
    if (typeof geo?.lat !== "number" || typeof geo?.lng !== "number") {
      return NextResponse.json({ error: "位置情報を取得できませんでした" }, { status: 400 });
    }
  } else if (!storage_uri || !mime_type) {
    return NextResponse.json({ error: "証跡ファイルが指定されていません" }, { status: 400 });
  }

  // ---- 証跡の取り込み ----
  let bytes: Buffer | undefined;
  let hash: string | null = null;
  let hashSource = "sha256";
  let exif: Record<string, unknown> = {};
  let submittedGeo: Geo | null = null;
  // 尺・解像度はブラウザが計測して送ってくる（サーバー側で動画をデコードしない）。
  // 判定AIには「どこまでを何コマで見たか」を伝えるために使う。
  const mediaMeta: MediaMeta = sanitizeMediaMeta(media_meta);

  // 位置情報は単独提出でも、写真・動画・音声への添付でも受け付ける
  if (typeof geo?.lat === "number" && typeof geo?.lng === "number") {
    submittedGeo = { lat: geo.lat, lng: geo.lng, accuracy_m: geo.accuracy_m ?? null };
    // 距離はサーバーで確定させる。緯度経度の計算をモデルにさせない
    if (c.target_geo?.lat != null) {
      submittedGeo.distance_m = distanceMeters(submittedGeo, c.target_geo);
    }
  }

  if (evidenceType === "gps") {
    // 位置情報にはファイルがないため、座標を丸めた文字列を重複検知のキーにする
    hash = sha256(Buffer.from(`${geo.lat.toFixed(5)},${geo.lng.toFixed(5)}`));
    hashSource = "geo-sha256";
  } else if (isLargeMedia(mime_type) && String(storage_uri).startsWith("gs://")) {
    // 動画・音声は Cloud Run に落とさず gs:// のまま Vertex AI に渡す。
    // 本体を読まない代わりに、メタデータだけで「本当に上がっているか」を必ず確かめる。
    const remote = await statObject(storage_uri);
    if (!remote || remote.sizeBytes === 0) {
      return NextResponse.json(
        { error: "アップロードが完了していません。通信状況を確認して、もう一度提出してください。" },
        { status: 400 },
      );
    }
    if (remote.sizeBytes > MAX_EVIDENCE_BYTES) {
      return NextResponse.json({ error: tooLargeMessage(remote.sizeBytes) }, { status: 413 });
    }
    mediaMeta.size_bytes = remote.sizeBytes;
    hash = remote.hash;
    hashSource = remote.hashSource;
  } else {
    bytes = await readObject(storage_uri);
    if (bytes.length > MAX_EVIDENCE_BYTES) {
      return NextResponse.json({ error: tooLargeMessage(bytes.length) }, { status: 413 });
    }
    mediaMeta.size_bytes = bytes.length;
    hash = sha256(bytes);
    if (mime_type.startsWith("image/")) {
      try {
        const exifr = (await import("exifr")).default;
        const p = await exifr.parse(bytes, ["DateTimeOriginal", "CreateDate", "GPSLatitude", "GPSLongitude", "Make", "Model"]);
        if (p) {
          exif = {
            taken_at: p.DateTimeOriginal ?? p.CreateDate ?? null,
            gps: p.GPSLatitude ? { lat: p.GPSLatitude, lng: p.GPSLongitude } : null,
            device: [p.Make, p.Model].filter(Boolean).join(" ") || null,
          };
        }
      } catch {
        /* EXIF なし。判定側で metadata_absent として扱われる */
      }
    }
  }

  // 使い回し検知: 同一ユーザーの過去提出に同一ハッシュがあるか
  const dup = hash
    ? await one<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM proof_submissions p JOIN commitments cc ON cc.id = p.commitment_id
          WHERE cc.user_id = $1 AND p.content_sha256 = $2 AND p.commitment_id <> $3`,
        [c.uid, hash, id],
      )
    : null;
  const duplicateHashMatch = Number(dup?.count ?? 0) > 0;

  const submittedAt = new Date();
  const proof = await one<any>(
    `INSERT INTO proof_submissions
       (commitment_id, storage_uri, mime_type, evidence_type, note, content_sha256, hash_source, exif, geo, media_meta, submitted_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      id, storage_uri ?? null, mime_type ?? null, evidenceType, note ?? null, hash, hashSource,
      JSON.stringify(exif), submittedGeo ? JSON.stringify(submittedGeo) : null,
      JSON.stringify(mediaMeta), submittedAt,
    ],
  );

  // 判定に失敗したら未判定のまま返す。AIに証跡が渡らなかったケースを
  // 「未達」として猶予期間に落とすと、見てもいない動画で課金に向かってしまう。
  let j;
  try {
    j = await judgeProof({
      evidenceType,
      recommendedEvidenceType: c.recommended_evidence_type ?? null,
      verificationRule: c.verification_rule,
      deadlineAt: new Date(c.deadline_at),
      submittedAt,
      note,
      exif,
      duplicateHashMatch,
      trustScore: Number(c.trust_score),
      file: evidenceType === "gps" ? null : { bytes, storageUri: storage_uri, mimeType: mime_type, meta: mediaMeta },
      geo: submittedGeo,
      targetGeo: c.target_geo ?? null,
    });
  } catch (e: any) {
    console.error("judge failed", { commitment_id: id, proof_id: proof.id, error: e?.message });
    return NextResponse.json(
      { error: e?.message ?? "判定に失敗しました。時間をおいて、もう一度提出してください。" },
      { status: 502 },
    );
  }

  await q(
    `INSERT INTO judgement_logs
       (commitment_id, proof_submission_id, agent, status, confidence_score, reasoning,
        detected_elements, suspicious_indicators, appeal_recommended, model,
        prompt_tokens, candidates_tokens, latency_ms, raw_response)
     VALUES ($1,$2,'judge',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      id, proof.id, j.status, j.confidence_score, j.reasoning,
      j.detected_elements, j.suspicious_indicators, j.appeal_recommended, j.model,
      j.promptTokens, j.candidatesTokens, j.latencyMs, JSON.stringify(j.raw),
    ],
  );

  if (j.status === "APPROVED") {
    await q(`UPDATE commitments SET status='APPROVED', updated_at=now() WHERE id=$1`, [id]);
    await q(`UPDATE users SET trust_score = LEAST(1, trust_score + 0.05) WHERE id=$1`, [c.uid]);
  } else {
    // 未達 or 判定不能 → 猶予期間を開始（ここで初めて grace_expires_at が入る）
    await q(
      `UPDATE commitments
          SET status='GRACE',
              grace_expires_at = now() + ($2 || ' hours')::interval,
              updated_at = now()
        WHERE id = $1`,
      [id, String(env.gracePeriodHours)],
    );
  }

  return NextResponse.json({ judgement: j, duplicate_hash_match: duplicateHashMatch, exif, geo: submittedGeo });
}

function tooLargeMessage(sizeBytes: number): string {
  return `ファイルが大きすぎます（${formatBytes(sizeBytes)}）。${formatBytes(MAX_EVIDENCE_BYTES)} 以内に収めてください。`;
}

/** ブラウザ由来の値なので、数値であることだけを保証して取り込む（判定の根拠にはしない補助情報） */
function sanitizeMediaMeta(input: any): MediaMeta {
  const num = (v: unknown, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(n, max) : null;
  };
  return {
    duration_sec: num(input?.duration_sec, 24 * 3600),
    width: num(input?.width, 100000),
    height: num(input?.height, 100000),
    size_bytes: num(input?.size_bytes, MAX_EVIDENCE_BYTES),
  };
}
