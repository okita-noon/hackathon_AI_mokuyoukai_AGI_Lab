import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * カード登録の確定。クライアントが stripe.confirmSetup() に成功した直後に叩く。
 *
 * NOTE: 本番では `setup_intent.succeeded` Webhook に置き換えること。
 * クライアント起点だと「confirm 成功後にタブを閉じた」ケースで
 * default_payment_method_id が保存されないまま取り残される。
 * Webhook なら Stripe が再送してくれるので確実に収束する。
 * ハッカソン版では Webhook secret / エンドポイント公開の設定を省くためこの方式にしている。
 */
export async function POST(req: Request) {
  if (!stripe) {
    return NextResponse.json(
      { error: "STRIPE_SECRET_KEY が未設定です（モック決済モード）" },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => null);
  const setupIntentId = body?.setupIntentId;
  if (!setupIntentId || typeof setupIntentId !== "string") {
    return NextResponse.json({ error: "setupIntentId は必須です" }, { status: 400 });
  }

  const user = await currentUser();
  let si;
  try {
    si = await stripe.setupIntents.retrieve(setupIntentId);
  } catch {
    return NextResponse.json({ error: "SetupIntent が見つかりません" }, { status: 404 });
  }

  // 他人の SetupIntent の ID を投げ込まれても他人のカードを紐付けないようにする
  const customerId = typeof si.customer === "string" ? si.customer : (si.customer?.id ?? null);
  if (!customerId || (user.stripe_customer_id && customerId !== user.stripe_customer_id)) {
    return NextResponse.json({ error: "この SetupIntent は利用できません" }, { status: 403 });
  }

  if (si.status !== "succeeded") {
    return NextResponse.json(
      { error: `カード登録が完了していません (status: ${si.status})` },
      { status: 409 },
    );
  }

  const paymentMethodId =
    typeof si.payment_method === "string" ? si.payment_method : (si.payment_method?.id ?? null);
  if (!paymentMethodId) {
    return NextResponse.json({ error: "支払い方法が取得できませんでした" }, { status: 409 });
  }

  await q(
    `UPDATE users
        SET stripe_customer_id = $2,
            default_payment_method_id = $3
      WHERE id = $1`,
    [user.id, customerId, paymentMethodId],
  );

  return NextResponse.json({ ok: true, default_payment_method_id: paymentMethodId });
}
