import { NextResponse } from "next/server";
import { one } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

type Stats = {
  total: number;
  approved: number;
  penalized: number;
  active: number;
  penalty_paid_yen: number;
};

type Card = { brand: string; last4: string; exp_month: number; exp_year: number };

/**
 * マイページ用の集約エンドポイント。
 * プロフィール + 実績サマリ + 登録済みカードを1往復で返す。
 */
export async function GET() {
  const user = await currentUser();

  // penalty_transactions は JOIN するとコミットメント側の件数が膨らむのでサブクエリで合算する。
  // MOCKED は Stripeキー未設定のデモ実行ぶん。実績としては「執行された」扱いで数える。
  const stats = await one<Stats>(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS approved,
       COUNT(*) FILTER (WHERE status = 'PENALIZED')::int AS penalized,
       COUNT(*) FILTER (WHERE status IN ('ACTIVE','SUBMITTED','GRACE','UNDER_REVIEW'))::int AS active,
       COALESCE((
         SELECT SUM(pt.amount)
           FROM penalty_transactions pt
           JOIN commitments c2 ON c2.id = pt.commitment_id
          WHERE c2.user_id = $1
            AND pt.status IN ('SUCCEEDED','MOCKED')
       ), 0)::int AS penalty_paid_yen
     FROM commitments
    WHERE user_id = $1`,
    [user.id],
  );

  // カードの実データは DB に持たない（PCI DSS のスコープを広げないため）。
  // 表示のたびに Stripe から引き直す。Stripe 未設定なら常に null。
  let card: Card | null = null;
  if (stripe && user.default_payment_method_id) {
    try {
      const pm = await stripe.paymentMethods.retrieve(user.default_payment_method_id);
      if (pm.card) {
        card = {
          brand: pm.card.brand,
          last4: pm.card.last4,
          exp_month: pm.card.exp_month,
          exp_year: pm.card.exp_year,
        };
      }
    } catch {
      // 支払い方法が Stripe 側で削除済みなど。マイページ全体を落とさず「未登録」として扱う。
      card = null;
    }
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      trust_score: user.trust_score,
      stripe_customer_id: user.stripe_customer_id,
      default_payment_method_id: user.default_payment_method_id,
    },
    card,
    stats: stats ?? { total: 0, approved: 0, penalized: 0, active: 0, penalty_paid_yen: 0 },
  });
}
