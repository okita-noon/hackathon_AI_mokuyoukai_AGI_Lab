import Stripe from "stripe";
import { one, pool } from "@/lib/backend/db";
import { CHECKOUT_SESSION_ID, checkoutSessionParams } from "@/lib/backend/checkout";

/**
 * 罰金の支払い（Stripe Checkout）。
 * STRIPE_SECRET_KEY が無ければ従来どおり MOCKED で記録するだけにする（デモのフェイルセーフ）。
 * Webhook は使わず、画面側のポーリングと決済後の戻りページで Stripe に状態を問い合わせて確定させる。
 * ローカルでも公開URLなしで動かせるようにするための割り切り。
 */
const secretKey = process.env.STRIPE_SECRET_KEY ?? "";
const stripe = secretKey ? new Stripe(secretKey) : null;

export const checkoutEnabled = Boolean(stripe);
/** テストモードなら画面にテストカード番号を出す */
export const checkoutTestMode = secretKey.startsWith("sk_test_");

export type CheckoutStatus =
  | { status: "paid"; amount: number }
  | { status: "unpaid"; amount: number; url: string | null; testMode: boolean }
  | { status: "expired"; amount: number };

type Row = {
  id: string;
  status: string;
  amount: number;
  stripe_checkout_session_id: string | null;
  title: string;
};

async function findPenalty(commitmentId: string, userId: string) {
  return one<Row>(
    `SELECT pt.id, pt.status, pt.amount, pt.stripe_checkout_session_id, c.title
       FROM penalty_transactions pt JOIN commitments c ON c.id = pt.commitment_id
      WHERE c.id = $1 AND c.user_id = $2 AND pt.provider = 'stripe_checkout'
      ORDER BY pt.created_at DESC LIMIT 1`,
    [commitmentId, userId],
  );
}

/** 支払い済みのセッションなら請求を SUCCEEDED にする。何度呼んでも結果は同じ */
async function settle(session: Stripe.Checkout.Session, penaltyId?: string): Promise<boolean> {
  if (session.payment_status !== "paid") return false;
  const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  await pool.query(
    `UPDATE penalty_transactions
        SET status = 'SUCCEEDED', paid_at = COALESCE(paid_at, now()),
            stripe_payment_intent_id = COALESCE($2, stripe_payment_intent_id)
      WHERE stripe_checkout_session_id = $1 AND ($3::uuid IS NULL OR id = $3) AND status <> 'SUCCEEDED'`,
    [session.id, paymentIntent ?? null, penaltyId ?? null],
  );
  return true;
}

/**
 * 支払い画面のURLを返す。開いているセッションがあれば使い回し、期限切れなら作り直す。
 * 画面の二重描画などで同時に呼ばれても、冪等キーで同じセッションに収束する。
 */
export async function ensureCheckout(commitmentId: string, userId: string, baseUrl: string): Promise<CheckoutStatus | null> {
  if (!stripe) return null;
  const row = await findPenalty(commitmentId, userId);
  if (!row) return null;
  if (row.status === "SUCCEEDED") return { status: "paid", amount: row.amount };

  if (row.stripe_checkout_session_id) {
    const current = await stripe.checkout.sessions.retrieve(row.stripe_checkout_session_id);
    if (await settle(current, row.id)) return { status: "paid", amount: row.amount };
    if (current.status === "open") return { status: "unpaid", amount: row.amount, url: current.url, testMode: checkoutTestMode };
  }

  const session = await stripe.checkout.sessions.create(
    checkoutSessionParams({ commitmentId, goal: row.title, amount: row.amount, baseUrl }),
    { idempotencyKey: `ai-okan-checkout-${row.id}-${row.stripe_checkout_session_id ?? "first"}` },
  );
  await pool.query(
    `UPDATE penalty_transactions SET stripe_checkout_session_id = $2, payment_url = $3 WHERE id = $1`,
    [row.id, session.id, session.url],
  );
  return { status: "unpaid", amount: row.amount, url: session.url, testMode: checkoutTestMode };
}

/** 画面のポーリング用。セッションは作らず、今の状態だけ返す */
export async function checkoutStatus(commitmentId: string, userId: string): Promise<CheckoutStatus | null> {
  if (!stripe) return null;
  const row = await findPenalty(commitmentId, userId);
  if (!row) return null;
  if (row.status === "SUCCEEDED") return { status: "paid", amount: row.amount };
  if (!row.stripe_checkout_session_id) return { status: "unpaid", amount: row.amount, url: null, testMode: checkoutTestMode };

  const session = await stripe.checkout.sessions.retrieve(row.stripe_checkout_session_id);
  if (await settle(session, row.id)) return { status: "paid", amount: row.amount };
  if (session.status === "expired") return { status: "expired", amount: row.amount };
  return { status: "unpaid", amount: row.amount, url: session.url, testMode: checkoutTestMode };
}

/**
 * デモ用: Stripe のテストカード（pm_card_visa）で罰金をその場で決済する。
 * カード番号を手入力せずに「本当に Stripe で決済が通る」ところまで見せるため。テストキーのときだけ動く。
 */
export async function payWithTestCard(commitmentId: string, userId: string): Promise<CheckoutStatus | null> {
  if (!stripe || !checkoutTestMode) return null;
  const row = await findPenalty(commitmentId, userId);
  if (!row) return null;
  if (row.status === "SUCCEEDED") return { status: "paid", amount: row.amount };

  const intent = await stripe.paymentIntents.create(
    {
      amount: row.amount,
      currency: "jpy",
      payment_method: "pm_card_visa",
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      description: `AIおかんとの約束の罰金「${row.title.slice(0, 80)}」（テストカード）`,
      metadata: { commitment_id: commitmentId },
    },
    { idempotencyKey: `ai-okan-testpay-${row.id}` },
  );
  if (intent.status !== "succeeded") return { status: "unpaid", amount: row.amount, url: null, testMode: true };

  await pool.query(
    `UPDATE penalty_transactions
        SET status = 'SUCCEEDED', paid_at = COALESCE(paid_at, now()), stripe_payment_intent_id = $2
      WHERE id = $1 AND status <> 'SUCCEEDED'`,
    [row.id, intent.id],
  );
  // 同じ罰金を支払い画面からもう一度払えないよう、開いたままの Checkout は閉じる
  if (row.stripe_checkout_session_id) {
    await stripe.checkout.sessions.expire(row.stripe_checkout_session_id).catch(() => undefined);
  }
  return { status: "paid", amount: row.amount };
}

/** 決済後の戻りページ用。セッションIDだけで確定させる（別端末で払った場合もここに来る） */
export async function confirmCheckoutSession(sessionId: string) {
  if (!stripe || !CHECKOUT_SESSION_ID.test(sessionId)) return null;
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  return { paid: await settle(session), amount: session.amount_total ?? 0 };
}
