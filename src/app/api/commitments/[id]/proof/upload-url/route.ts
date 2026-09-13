import { NextResponse } from "next/server";
import { ACCEPTED_MIME, createUploadTarget } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** 署名付きアップロードURLの払い出し（GCS直PUT / ローカルは同形のフォールバック） */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { mimeType } = await req.json();
  if (!ACCEPTED_MIME.has(mimeType)) {
    return NextResponse.json(
      { error: `対応していない形式です (${mimeType ?? "unknown"})`, accepted: [...ACCEPTED_MIME] },
      { status: 400 },
    );
  }
  return NextResponse.json(await createUploadTarget(id, mimeType));
}
