/**
 * Stripe Checkout で罰金を払うための純粋な組み立て処理。
 * Stripe や DB に触らないのでテストから直接呼べる。
 */

/** Checkout セッションIDとして受け付ける形式。URL から来る値なので形式で弾いておく */
export const CHECKOUT_SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]+$/;

/**
 * 決済後に戻ってくるアプリのURL。
 * APP_BASE_URL があればそれを使い、無ければリクエストの Host から組み立てる（Cloud Run では公開ドメインになる）。
 */
export function appBaseUrl(headers: Headers, configured = process.env.APP_BASE_URL): string {
  if (configured) return configured.replace(/\/+$/, "");
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost:3000";
  const local = /^(localhost|127\.|\[::1\])/.test(host);
  const proto = headers.get("x-forwarded-proto")?.split(",")[0].trim() || (local ? "http" : "https");
  return `${proto}://${host}`;
}

export function checkoutSessionParams(p: { commitmentId: string; goal: string; amount: number; baseUrl: string }) {
  return {
    mode: "payment" as const,
    locale: "ja" as const,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "jpy",
          // 円はゼロ小数通貨なので、金額をそのまま最小単位として渡す
          unit_amount: p.amount,
          product_data: { name: `AIおかんとの約束の罰金「${p.goal.slice(0, 80)}」` },
        },
      },
    ],
    client_reference_id: p.commitmentId,
    metadata: { commitment_id: p.commitmentId },
    success_url: `${p.baseUrl}/penalty/paid?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${p.baseUrl}/`,
  };
}
