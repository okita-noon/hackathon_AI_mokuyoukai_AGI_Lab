import Stripe from "stripe";
import { env } from "./env";

export const stripe = env.stripeSecretKey ? new Stripe(env.stripeSecretKey) : null;
export const stripeEnabled = Boolean(stripe);

/** 契約時に呼ぶ: 顧客を作り、カードを「保存」するための SetupIntent を返す */
export async function createSetupIntent(email: string, existingCustomerId?: string | null) {
  if (!stripe) return null;
  const customer = existingCustomerId
    ? await stripe.customers.retrieve(existingCustomerId)
    : await stripe.customers.create({ email });
  const si = await stripe.setupIntents.create({
    customer: customer.id,
    payment_method_types: ["card"],
    usage: "off_session", // 後日ユーザー不在で課金するため必須
  });
  return { customerId: customer.id, clientSecret: si.client_secret! };
}

export type ChargeResult = {
  paymentIntentId: string | null;
  status: "SUCCEEDED" | "FAILED" | "REQUIRES_ACTION" | "MOCKED";
  failureReason: string | null;
};

/**
 * ペナルティ執行。保存済みカードに off_session で課金する。
 * idempotencyKey により、ワーカーが再実行されても二重課金しない。
 */
export async function chargePenalty(args: {
  customerId: string | null;
  paymentMethodId: string | null;
  amount: number;
  currency: string;
  idempotencyKey: string;
  description: string;
}): Promise<ChargeResult> {
  // Stripeキー未設定（ハッカソンのデモ環境）ではモック成功させ、フローだけ完走させる
  if (!stripe || !args.customerId || !args.paymentMethodId) {
    return { paymentIntentId: null, status: "MOCKED", failureReason: null };
  }
  try {
    const pi = await stripe.paymentIntents.create(
      {
        amount: args.amount,
        currency: args.currency,
        customer: args.customerId,
        payment_method: args.paymentMethodId,
        off_session: true,
        confirm: true,
        description: args.description,
      },
      { idempotencyKey: args.idempotencyKey },
    );
    return {
      paymentIntentId: pi.id,
      status: pi.status === "succeeded" ? "SUCCEEDED" : "REQUIRES_ACTION",
      failureReason: pi.status === "succeeded" ? null : pi.status,
    };
  } catch (e: any) {
    // 3Dセキュア要求・残高不足などはここに来る（e.raw.payment_intent に PI がある場合がある）
    return {
      paymentIntentId: e?.raw?.payment_intent?.id ?? null,
      status: "FAILED",
      failureReason: e?.message ?? "unknown stripe error",
    };
  }
}
