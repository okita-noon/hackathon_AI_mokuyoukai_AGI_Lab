import { NextResponse } from "next/server";
import { one, q } from "@/lib/db";
import { readObject } from "@/lib/storage";
import { arbitrate } from "@/lib/ai/judge";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 異議申し立て → 調停AI(Arbiter)が再判定。認容されればペナルティは執行されない */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { statement } = await req.json();
  if (!statement || String(statement).trim().length < 5) {
    return NextResponse.json({ error: "異議の内容を入力してください" }, { status: 400 });
  }

  const c = await one<any>(
    `SELECT c.*, u.trust_score, u.id AS uid FROM commitments c JOIN users u ON u.id=c.user_id WHERE c.id=$1`,
    [id],
  );
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (c.status !== "GRACE") {
    return NextResponse.json({ error: "猶予期間中のみ異議申し立てできます" }, { status: 409 });
  }

  const appeal = await one<any>(
    `INSERT INTO appeals (commitment_id, user_statement) VALUES ($1,$2)
     ON CONFLICT (commitment_id) DO NOTHING RETURNING *`,
    [id, String(statement).slice(0, 2000)],
  );
  if (!appeal) return NextResponse.json({ error: "異議申し立ては1回までです" }, { status: 409 });

  await q(`UPDATE commitments SET status='UNDER_REVIEW', updated_at=now() WHERE id=$1`, [id]);

  const proof = await one<any>(
    `SELECT * FROM proof_submissions WHERE commitment_id=$1 ORDER BY submitted_at DESC LIMIT 1`,
    [id],
  );
  const first = await one<any>(
    `SELECT * FROM judgement_logs WHERE commitment_id=$1 AND agent='judge' ORDER BY created_at DESC LIMIT 1`,
    [id],
  );

  // 証跡が一切ない（未提出で期限切れ）ケースは調停の余地がないため機械的に棄却する
  if (!proof) {
    await q(`UPDATE appeals SET status='DISMISSED', resolved_at=now() WHERE id=$1`, [appeal.id]);
    await q(`UPDATE commitments SET status='GRACE', updated_at=now() WHERE id=$1`, [id]);
    return NextResponse.json({ appeal_status: "DISMISSED", reason: "証拠が提出されていません" });
  }

  // 画像だけ本体を読み戻す。動画・音声は gs:// のまま Vertex AI に渡す
  const isImage = String(proof.mime_type ?? "").startsWith("image/");
  const bytes = isImage && proof.storage_uri ? await readObject(proof.storage_uri) : undefined;
  const a = await arbitrate({
    evidenceType: proof.evidence_type ?? "photo",
    recommendedEvidenceType: c.recommended_evidence_type ?? null,
    verificationRule: c.verification_rule,
    deadlineAt: new Date(c.deadline_at),
    submittedAt: new Date(proof.submitted_at),
    note: proof.note,
    exif: proof.exif,
    duplicateHashMatch: false,
    trustScore: Number(c.trust_score),
    file: proof.storage_uri ? { bytes, storageUri: proof.storage_uri, mimeType: proof.mime_type } : null,
    geo: proof.geo ?? null,
    targetGeo: c.target_geo ?? null,
    firstJudgement: {
      status: first?.status ?? "REJECTED",
      confidence_score: Number(first?.confidence_score ?? 1),
      reasoning: first?.reasoning ?? "証拠未提出",
      detected_elements: first?.detected_elements ?? [],
      suspicious_indicators: first?.suspicious_indicators ?? [],
      appeal_recommended: true,
    },
    appealText: String(statement),
  });

  const log = await one<any>(
    `INSERT INTO judgement_logs
       (commitment_id, proof_submission_id, agent, status, confidence_score, reasoning,
        detected_elements, suspicious_indicators, appeal_recommended, model,
        prompt_tokens, candidates_tokens, latency_ms, raw_response)
     VALUES ($1,$2,'arbiter',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [
      id, proof.id, a.status, a.confidence_score, a.reasoning,
      a.detected_elements, a.suspicious_indicators, a.appeal_recommended, a.model,
      a.promptTokens, a.candidatesTokens, a.latencyMs, JSON.stringify(a.raw),
    ],
  );

  // UNCERTAIN も「疑わしきは罰せず」で認容側に倒す
  const upheld = a.status === "APPROVED" || a.status === "UNCERTAIN";
  await q(
    `UPDATE appeals SET status=$2, arbiter_judgement_id=$3, resolved_at=now() WHERE id=$1`,
    [appeal.id, upheld ? "UPHELD" : "DISMISSED", log.id],
  );
  await q(
    `UPDATE commitments SET status=$2, updated_at=now() WHERE id=$1`,
    [id, upheld ? "APPROVED" : "GRACE"],
  );

  return NextResponse.json({ appeal_status: upheld ? "UPHELD" : "DISMISSED", judgement: a });
}
