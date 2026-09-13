import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { createSetupIntent, stripeEnabled } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/** カード登録用の SetupIntent を返す（実際のカード入力は Stripe Elements 側で行う） */
export async function POST() {
  if (!stripeEnabled) {
    return NextResponse.json({ mock: true, message: "STRIPE_SECRET_KEY 未設定のためモック決済で動作します" });
  }
  const user = await currentUser();
  const si = await createSetupIntent(user.email, user.stripe_customer_id);
  await q(`UPDATE users SET stripe_customer_id = $2 WHERE id = $1`, [user.id, si!.customerId]);
  return NextResponse.json({ clientSecret: si!.clientSecret });
}
