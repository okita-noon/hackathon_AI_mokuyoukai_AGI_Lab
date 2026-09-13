import { NextResponse } from "next/server";
import { one, q } from "@/lib/db";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  const rows = await q(
    `SELECT c.*,
            (SELECT row_to_json(j) FROM (
               SELECT status, confidence_score, reasoning, suspicious_indicators, appeal_recommended, agent
                 FROM judgement_logs WHERE commitment_id = c.id ORDER BY created_at DESC LIMIT 1
             ) j) AS last_judgement,
            (SELECT status FROM appeals WHERE commitment_id = c.id) AS appeal_status
       FROM commitments c
      WHERE c.user_id = $1
      ORDER BY c.created_at DESC`,
    [user.id],
  );
  return NextResponse.json({ user, commitments: rows });
}

export async function POST(req: Request) {
  const user = await currentUser();
  const body = await req.json();
  const { title, verification_rule, penalty_amount, deadline_at, evidence_type, target_geo } = body ?? {};

  if (!title || !verification_rule || !penalty_amount || !deadline_at) {
    return NextResponse.json(
      { error: "title / verification_rule / penalty_amount / deadline_at は必須です" },
      { status: 400 },
    );
  }
  if (Number(penalty_amount) < 100) {
    return NextResponse.json({ error: "ペナルティ額は100円以上にしてください" }, { status: 400 });
  }

  // AIの提案はあくまで推奨。提出時にユーザーが別の種類を選んでもよい
  const recommendedEvidenceType = ["photo", "video", "audio", "gps"].includes(evidence_type) ? evidence_type : "photo";
  // 位置情報で判定するなら目標地点がないと成立しない
  if (recommendedEvidenceType === "gps" && (typeof target_geo?.lat !== "number" || typeof target_geo?.lng !== "number")) {
    return NextResponse.json({ error: "位置情報で判定するには目標地点が必要です" }, { status: 400 });
  }
  // 目標地点は種類に依存させない。写真に現在地を添えて出す使い方も許すため。
  const targetGeo =
    target_geo && typeof target_geo.lat === "number"
      ? {
          lat: target_geo.lat,
          lng: target_geo.lng,
          radius_m: Math.min(5000, Math.max(20, Number(target_geo.radius_m) || 100)),
          label: String(target_geo.label ?? "").slice(0, 100) || null,
        }
      : null;

  const row = await one(
    `INSERT INTO commitments (user_id, title, verification_rule, penalty_amount, deadline_at, recommended_evidence_type, target_geo)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      user.id,
      String(title).slice(0, 200),
      String(verification_rule).slice(0, 1000),
      Math.floor(Number(penalty_amount)),
      new Date(deadline_at),
      recommendedEvidenceType,
      targetGeo ? JSON.stringify(targetGeo) : null,
    ],
  );
  return NextResponse.json(row, { status: 201 });
}
