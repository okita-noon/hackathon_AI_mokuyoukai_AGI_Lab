import { currentUser } from "@/lib/backend/db";
import { checkoutTestMode, payWithTestCard } from "@/lib/backend/payment";
import { readJsonBody, RequestTooLargeError } from "@/lib/backend/request";
import { anonymousSession, jsonWithSession } from "@/lib/backend/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_BODY_BYTES = 16 * 1024;

/** デモ用: テストカードで罰金を決済する。sk_test_ のキーのときだけ使える */
export async function POST(req: Request) {
  const session = anonymousSession(req);
  if (!checkoutTestMode) {
    return jsonWithSession(session, { error: "テストモードの Stripe キーでのみ使えます" }, { status: 403 });
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
    const result = await payWithTestCard(commitmentId, user.id);
    if (!result) return jsonWithSession(session, { error: "支払い待ちの罰金が見つかりません" }, { status: 404 });
    if (result.status !== "paid") return jsonWithSession(session, { error: "テスト決済が完了しませんでした" }, { status: 502 });
    return jsonWithSession(session, result);
  } catch (error) {
    console.error("[penalty:test-pay]", error);
    return jsonWithSession(session, { error: "テスト決済に失敗しました" }, { status: 502 });
  }
}
