import { NextResponse } from "next/server";
import { one, q } from "@/lib/db";
import { env } from "@/lib/env";
import { distanceMeters, getRemoteHash, isLargeMedia, readObject, sha256 } from "@/lib/storage";
import { judgeProof, type EvidenceType, type Geo } from "@/lib/ai/judge";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 動画判定は画像より時間がかかる

/**
 * 証跡提出 → Gemini 判定 → DB保存 → 猶予タイマー設定 を1リクエストで行う。
 *
 * req: { storage_uri?, mime_type?, note?, geo? }
 *   - photo/video/audio: storage_uri + mime_type が必須
 *   - gps:               geo { lat, lng, accuracy_m } が必須（ファイルなし）
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { storage_uri, mime_type, note, geo, evidence_type } = await req.json();

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
  // 指定がなければ、届いたものから種類を推測する。
  const evidenceType: EvidenceType = (["photo", "video", "audio", "gps"] as const).includes(evidence_type)
    ? evidence_type
    : mime_type?.startsWith("video/")
      ? "video"
      : mime_type?.startsWith("audio/")
        ? "audio"
        : storage_uri
          ? "photo"
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
    // 動画・音声は Cloud Run に落とさず gs:// のまま Vertex AI に渡す
    const remote = await getRemoteHash(storage_uri);
    hash = remote?.hash ?? null;
    hashSource = remote?.source ?? "none";
  } else {
    bytes = await readObject(storage_uri);
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
       (commitment_id, storage_uri, mime_type, evidence_type, note, content_sha256, hash_source, exif, geo, submitted_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      id, storage_uri ?? null, mime_type ?? null, evidenceType, note ?? null, hash, hashSource,
      JSON.stringify(exif), submittedGeo ? JSON.stringify(submittedGeo) : null, submittedAt,
    ],
  );

  const j = await judgeProof({
    evidenceType,
    recommendedEvidenceType: c.recommended_evidence_type ?? null,
    verificationRule: c.verification_rule,
    deadlineAt: new Date(c.deadline_at),
    submittedAt,
    note,
    exif,
    duplicateHashMatch,
    trustScore: Number(c.trust_score),
    file: evidenceType === "gps" ? null : { bytes, storageUri: storage_uri, mimeType: mime_type },
    geo: submittedGeo,
    targetGeo: c.target_geo ?? null,
  });

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
