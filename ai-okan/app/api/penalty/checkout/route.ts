import { NextResponse } from "next/server";
import { currentUser } from "@/lib/backend/db";
import { appBaseUrl } from "@/lib/backend/checkout";
import { checkoutEnabled, checkoutStatus, ensureCheckout } from "@/lib/backend/payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

/** 罰金の支払い画面（Stripe Checkout）のURLを返す */
export async function POST(req: Request) {
  if (!checkoutEnabled) {
    return NextResponse.json({ error: "STRIPE_SECRET_KEY が未設定のため、罰金はモックで記録しています" }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as { commitmentId?: unknown } | null;
  const commitmentId = String(body?.commitmentId ?? "");
  if (!UUID.test(commitmentId)) return NextResponse.json({ error: "commitmentId が不正です" }, { status: 400 });

  try {
    const user = await currentUser();
    const result = await ensureCheckout(commitmentId, user.id, appBaseUrl(req.headers));
    if (!result) return NextResponse.json({ error: "支払い待ちの罰金が見つかりません" }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[penalty:checkout]", error);
    return NextResponse.json({ error: "支払い画面を用意できませんでした" }, { status: 502 });
  }
}

/** 支払い状況の確認。スマホで払ったときに PC の画面を切り替えるためのポーリング先 */
export async function GET(req: Request) {
  if (!checkoutEnabled) return NextResponse.json({ error: "Stripe は未設定です" }, { status: 503 });
  const commitmentId = new URL(req.url).searchParams.get("commitmentId") ?? "";
  if (!UUID.test(commitmentId)) return NextResponse.json({ error: "commitmentId が不正です" }, { status: 400 });

  try {
    const user = await currentUser();
    const result = await checkoutStatus(commitmentId, user.id);
    if (!result) return NextResponse.json({ error: "支払い待ちの罰金が見つかりません" }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[penalty:status]", error);
    return NextResponse.json({ error: "支払い状況を確認できませんでした" }, { status: 502 });
  }
}
