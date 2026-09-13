import { NextResponse } from "next/server";
import { currentUser } from "@/lib/backend/db";
import { checkoutTestMode, payWithTestCard } from "@/lib/backend/payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

/** デモ用: テストカードで罰金を決済する。sk_test_ のキーのときだけ使える */
export async function POST(req: Request) {
  if (!checkoutTestMode) {
    return NextResponse.json({ error: "テストモードの Stripe キーでのみ使えます" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { commitmentId?: unknown } | null;
  const commitmentId = String(body?.commitmentId ?? "");
  if (!UUID.test(commitmentId)) return NextResponse.json({ error: "commitmentId が不正です" }, { status: 400 });

  try {
    const user = await currentUser();
    const result = await payWithTestCard(commitmentId, user.id);
    if (!result) return NextResponse.json({ error: "支払い待ちの罰金が見つかりません" }, { status: 404 });
    if (result.status !== "paid") return NextResponse.json({ error: "テスト決済が完了しませんでした" }, { status: 502 });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[penalty:test-pay]", error);
    return NextResponse.json({ error: "テスト決済に失敗しました" }, { status: 502 });
  }
}
