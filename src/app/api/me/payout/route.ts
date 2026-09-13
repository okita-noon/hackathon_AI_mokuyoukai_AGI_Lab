import { NextResponse } from "next/server";
import { one } from "@/lib/db";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const DESTINATIONS = ["app", "donation", "friend"] as const;
type Destination = (typeof DESTINATIONS)[number];

/**
 * ペナルティの支払先を保存する。
 *
 * 注意: 実際に第三者へ送金するには Stripe Connect（送金先のオンボーディング）が必要で、
 * MVPの範囲を超える。ここでは「誰に渡すと宣言したか」だけを保持し、
 * 課金自体は従来どおり運営アカウントに対して行う。UI にもその旨を明示している。
 */
export async function POST(req: Request) {
  const user = await currentUser();
  const body = await req.json().catch(() => ({}));
  const destination = body?.destination as Destination;

  if (!DESTINATIONS.includes(destination)) {
    return NextResponse.json({ error: "支払先を選んでください" }, { status: 400 });
  }

  let detail: Record<string, string> | null = null;
  if (destination === "donation") {
    const charity = String(body?.charity ?? "").trim().slice(0, 100);
    if (!charity) return NextResponse.json({ error: "寄付先を選んでください" }, { status: 400 });
    detail = { charity };
  } else if (destination === "friend") {
    const name = String(body?.name ?? "").trim().slice(0, 50);
    if (!name) return NextResponse.json({ error: "渡す相手の名前を入力してください" }, { status: 400 });
    detail = { name, contact: String(body?.contact ?? "").trim().slice(0, 200) };
  }

  const updated = await one(
    `UPDATE users SET payout_destination = $2, payout_detail = $3 WHERE id = $1
     RETURNING id, payout_destination, payout_detail`,
    [user.id, destination, detail ? JSON.stringify(detail) : null],
  );
  return NextResponse.json(updated);
}
