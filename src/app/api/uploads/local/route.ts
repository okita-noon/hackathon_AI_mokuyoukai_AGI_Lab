import { NextResponse } from "next/server";
import { putLocalObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** STORAGE_DRIVER=local のときだけ使う、GCS署名付きURLの代替エンドポイント */
export async function PUT(req: Request) {
  const objectPath = new URL(req.url).searchParams.get("path");
  if (!objectPath || objectPath.includes("..")) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }
  await putLocalObject(objectPath, Buffer.from(await req.arrayBuffer()));
  return NextResponse.json({ ok: true });
}
