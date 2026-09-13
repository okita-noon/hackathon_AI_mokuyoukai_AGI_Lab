import { NextResponse } from "next/server";
import pastSelf from "@/data/usutaku.json";
import type { PastSelf } from "@/lib/types";

export const runtime = "nodejs";

/**
 * おかんに渡す元データ。
 * 画面に直接埋め込まず、バックエンドから配る。差し替えや追加をサーバー側だけで済ませるため。
 */
export async function GET() {
  const data = pastSelf as PastSelf;
  const total = data.sources.reduce((sum, s) => sum + s.items.length, 0);
  return NextResponse.json({ ...data, total });
}
