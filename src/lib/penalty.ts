import { q, tx } from "./db";
import { env } from "./env";
import { chargePenalty } from "./stripe";

export type TickReport = {
  expired: string[];   // 締切超過で猶予期間に入れたコミットメント
  charged: string[];   // ペナルティ執行
  waived: string[];    // 免責（UNCERTAIN / 異議認容）
  failed: string[];    // 決済失敗
};

/**
 * ④ ペナルティ執行ワーカー本体。
 * Cloud Scheduler → POST /api/cron/tick から定期実行される（Cloud Tasks の per-task タイマーを
 * 「1本のスイープクエリ」に畳んだのが MVP の最大の簡略化点）。
 * 何度呼ばれても同じ結果になるよう、状態遷移はすべて条件付きUPDATEで行う。
 */
export async function runTick(now = new Date()): Promise<TickReport> {
  const report: TickReport = { expired: [], charged: [], waived: [], failed: [] };

  // ---- Phase 1: 締切を過ぎたが未提出のもの → 猶予期間へ ----
  const expired = await q<{ id: string }>(
    `UPDATE commitments
        SET status = 'GRACE',
            grace_expires_at = $1::timestamptz + ($2 || ' hours')::interval,
            updated_at = now()
      WHERE status = 'ACTIVE' AND deadline_at <= $1
      RETURNING id`,
    [now.toISOString(), String(env.gracePeriodHours)],
  );
  for (const r of expired) {
    report.expired.push(r.id);
    await q(
      `INSERT INTO judgement_logs
         (commitment_id, agent, status, confidence_score, reasoning, model)
       VALUES ($1, 'system', 'REJECTED', 1.00, '期限までに証拠の提出がありませんでした。', 'rule-based')`,
      [r.id],
    );
  }

  // ---- Phase 2: 猶予期間が切れたもの → 執行 or 免責 ----
  const due = await q<{ id: string }>(
    `SELECT id FROM commitments
      WHERE status = 'GRACE' AND grace_expires_at <= $1
      ORDER BY grace_expires_at
      LIMIT 50`,
    [now.toISOString()],
  );

  for (const { id } of due) {
    const outcome = await resolveOne(id, now);
    if (outcome === "CHARGED") report.charged.push(id);
    else if (outcome === "WAIVED") report.waived.push(id);
    else if (outcome === "FAILED") report.failed.push(id);
  }

  return report;
}

type Outcome = "CHARGED" | "WAIVED" | "FAILED" | "SKIPPED";

async function resolveOne(commitmentId: string, now: Date): Promise<Outcome> {
  // 行ロックで掴んでから判定する。ワーカーが並列に走っても1件は1回しか処理されない
  const ctx = await tx(async (c) => {
    const { rows } = await c.query(
      `SELECT c.id, c.user_id, c.title, c.penalty_amount, c.currency, c.status,
              u.email, u.stripe_customer_id, u.default_payment_method_id, u.trust_score
         FROM commitments c JOIN users u ON u.id = c.user_id
        WHERE c.id = $1 AND c.status = 'GRACE'
        FOR UPDATE OF c SKIP LOCKED`,
      [commitmentId],
    );
    if (!rows[0]) return null;

    const { rows: jl } = await c.query(
      `SELECT status FROM judgement_logs
        WHERE commitment_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [commitmentId],
    );
    const { rows: ap } = await c.query(
      `SELECT status FROM appeals WHERE commitment_id = $1`,
      [commitmentId],
    );
    return { commitment: rows[0], lastJudgement: jl[0]?.status ?? "REJECTED", appeal: ap[0]?.status ?? null };
  });
  if (!ctx) return "SKIPPED";

  const { commitment, lastJudgement, appeal } = ctx;

  // 免責条件: 判定が UNCERTAIN のまま確定した / 異議が認容された
  //  → 「疑わしきは課金せず」。誤課金のダメージは見逃しより大きい、という前提の設計。
  if (lastJudgement === "UNCERTAIN" || appeal === "UPHELD") {
    await q(
      `UPDATE commitments SET status = 'APPROVED', updated_at = now() WHERE id = $1 AND status = 'GRACE'`,
      [commitment.id],
    );
    return "WAIVED";
  }
  // 異議が審理中なら執行を保留（次のtickで再評価）
  if (appeal === "PENDING") return "SKIPPED";

  const idempotencyKey = `penalty_${commitment.id}`;
  const result = await chargePenalty({
    customerId: commitment.stripe_customer_id,
    paymentMethodId: commitment.default_payment_method_id,
    amount: commitment.penalty_amount,
    currency: commitment.currency,
    idempotencyKey,
    description: `CommitPay penalty: ${commitment.title}`,
  });

  const ok = result.status === "SUCCEEDED" || result.status === "MOCKED";
  await q(
    `INSERT INTO penalty_transactions
       (commitment_id, stripe_payment_intent_id, amount, currency, status, failure_reason, idempotency_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      commitment.id,
      result.paymentIntentId,
      commitment.penalty_amount,
      commitment.currency,
      result.status,
      result.failureReason,
      idempotencyKey,
    ],
  );
  await q(
    `UPDATE commitments SET status = $2, updated_at = now() WHERE id = $1 AND status = 'GRACE'`,
    [commitment.id, ok ? "PENALIZED" : "FAILED_PAYMENT"],
  );
  // 信頼スコアを下げる（次回以降の判定コンテキストに効く）
  await q(
    `UPDATE users SET trust_score = GREATEST(0, trust_score - 0.10) WHERE id = $1`,
    [commitment.user_id],
  );

  return ok ? "CHARGED" : "FAILED";
}
