import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

type PromiseRow = {
  id: string;
  title: string;
  verification_rule: string;
  penalty_amount: number;
  deadline_at: string;
  status: string;
  created_at: string;
  updated_at: string;
  proof_count: number;
  judgement_count: number;
  last_submission_at: string | null;
  judgement_status: string | null;
  confidence_score: string | number | null;
  reasoning: string | null;
};

const ACHIEVED = new Set(["APPROVED"]);
const MISSED = new Set(["PENALIZED", "FAILED_PAYMENT"]);
const ACTIVE = new Set(["ACTIVE", "SUBMITTED", "GRACE", "UNDER_REVIEW"]);

export async function GET() {
  const user = await currentUser();
  const promises = await q<PromiseRow>(
    `SELECT c.id, c.title, c.verification_rule, c.penalty_amount, c.deadline_at,
            c.status, c.created_at, c.updated_at,
            (SELECT COUNT(*)::int FROM proof_submissions p WHERE p.commitment_id = c.id) AS proof_count,
            (SELECT COUNT(*)::int FROM judgement_logs j WHERE j.commitment_id = c.id) AS judgement_count,
            (SELECT MAX(p.submitted_at) FROM proof_submissions p WHERE p.commitment_id = c.id) AS last_submission_at,
            latest.status AS judgement_status,
            latest.confidence_score,
            latest.reasoning
       FROM commitments c
       LEFT JOIN LATERAL (
         SELECT status, confidence_score, reasoning
           FROM judgement_logs
          WHERE commitment_id = c.id
          ORDER BY created_at DESC
          LIMIT 1
       ) latest ON true
      WHERE c.user_id = $1
      ORDER BY c.created_at DESC`,
    [user.id],
  );

  const paidRows = await q<{ total: number }>(
    `SELECT COALESCE(SUM(pt.amount), 0)::int AS total
       FROM penalty_transactions pt
       JOIN commitments c ON c.id = pt.commitment_id
      WHERE c.user_id = $1 AND pt.status IN ('SUCCEEDED', 'MOCKED')`,
    [user.id],
  );

  const achieved = promises.filter((item) => ACHIEVED.has(item.status)).length;
  const missed = promises.filter((item) => MISSED.has(item.status)).length;
  const active = promises.filter((item) => ACTIVE.has(item.status)).length;
  const decided = achieved + missed;
  const confidenceValues = promises
    .filter((item) => item.confidence_score !== null)
    .map((item) => Number(item.confidence_score))
    .filter((value) => Number.isFinite(value));

  const weekly = Array.from({ length: 6 }, (_, index) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (5 - index) * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const items = promises.filter((item) => {
      const date = new Date(item.updated_at);
      return date >= start && date < end && (ACHIEVED.has(item.status) || MISSED.has(item.status));
    });
    return {
      label: `${start.getMonth() + 1}/${start.getDate()}`,
      achieved: items.filter((item) => ACHIEVED.has(item.status)).length,
      missed: items.filter((item) => MISSED.has(item.status)).length,
    };
  });

  return NextResponse.json({
    user: { display_name: user.display_name },
    summary: {
      total: promises.length,
      achieved,
      missed,
      active,
      decided,
      achievement_rate: decided > 0 ? Math.round((achieved / decided) * 100) : 0,
      proof_rate: promises.length > 0
        ? Math.round((promises.filter((item) => item.proof_count > 0).length / promises.length) * 100)
        : 0,
      average_confidence: confidenceValues.length > 0
        ? Math.round((confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length) * 100)
        : null,
      protected_yen: promises
        .filter((item) => ACHIEVED.has(item.status))
        .reduce((sum, item) => sum + item.penalty_amount, 0),
      paid_yen: paidRows[0]?.total ?? 0,
    },
    weekly,
    promises,
  });
}
