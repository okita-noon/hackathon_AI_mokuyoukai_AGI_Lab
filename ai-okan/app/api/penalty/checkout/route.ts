import { currentUser } from "@/lib/backend/db";
import { appBaseUrl } from "@/lib/backend/checkout";
import { checkoutEnabled, checkoutStatus, ensureCheckout } from "@/lib/backend/payment";
import { readJsonBody, RequestTooLargeError } from "@/lib/backend/request";
import { anonymousSession, jsonWithSession } from "@/lib/backend/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_BODY_BYTES = 16 * 1024;

/** 罰金の支払い画面（Stripe Checkout）のURLを返す */
export async function POST(req: Request) {
  const session = anonymousSession(req);
  if (!checkoutEnabled) {
    return jsonWithSession(session, { error: "STRIPE_SECRET_KEY が未設定のため、罰金はモックで記録しています" }, { status: 503 });
  }
  let body: { commitmentId?: unknown } | null;
  try {
    body = await readJsonBody(req, MAX_BODY_BYTES) as { commitmentId?: unknown } | null;
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      return jsonWithSession(session, { error: "リクエストが大きすぎます" }, { status: 413 });
    }
    throw error;
  }
  const commitmentId = String(body?.commitmentId ?? "");
  if (!UUID.test(commitmentId)) return jsonWithSession(session, { error: "commitmentId が不正です" }, { status: 400 });

  try {
    const user = await currentUser(session.id);
    const result = await ensureCheckout(commitmentId, user.id, appBaseUrl(req.headers));
    if (!result) return jsonWithSession(session, { error: "支払い待ちの罰金が見つかりません" }, { status: 404 });
    return jsonWithSession(session, result);
  } catch (error) {
    console.error("[penalty:checkout]", error);
    return jsonWithSession(session, { error: "支払い画面を用意できませんでした" }, { status: 502 });
  }
}

/** 支払い状況の確認。スマホで払ったときに PC の画面を切り替えるためのポーリング先 */
export async function GET(req: Request) {
  const session = anonymousSession(req);
  if (!checkoutEnabled) return jsonWithSession(session, { error: "Stripe は未設定です" }, { status: 503 });
  const commitmentId = new URL(req.url).searchParams.get("commitmentId") ?? "";
  if (!UUID.test(commitmentId)) return jsonWithSession(session, { error: "commitmentId が不正です" }, { status: 400 });

  try {
    const user = await currentUser(session.id);
    const result = await checkoutStatus(commitmentId, user.id);
    if (!result) return jsonWithSession(session, { error: "支払い待ちの罰金が見つかりません" }, { status: 404 });
    return jsonWithSession(session, result);
  } catch (error) {
    console.error("[penalty:status]", error);
    return jsonWithSession(session, { error: "支払い状況を確認できませんでした" }, { status: 502 });
  }
}
