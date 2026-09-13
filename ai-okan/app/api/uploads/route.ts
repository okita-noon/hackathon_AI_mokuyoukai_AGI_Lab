import { NextResponse } from "next/server";
import { ACCEPTED_VIDEO_MIME, createUploadTarget, storageEnabled } from "@/lib/storage";
import { MAX_VIDEO_BYTES, formatBytes } from "@/lib/media-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 動画の直接アップロード先を払い出す。
 *
 * base64 でリクエストに載せると Cloud Run の 32MB 制限に当たるため、
 * ブラウザ → Cloud Storage へ直接 PUT させ、アプリは gs:// のURIだけを受け取る。
 * GCS_BUCKET 未設定の環境（ローカルなど）では 501 を返し、呼び出し側が
 * 従来どおり base64 で送る経路に落ちる。
 */
export async function POST(req: Request) {
  if (!storageEnabled()) {
    return NextResponse.json({ error: "この環境では直接アップロードを使えません" }, { status: 501 });
  }
  const body = (await req.json().catch(() => null)) as { mimeType?: unknown; sizeBytes?: unknown } | null;
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "";
  const sizeBytes = Number(body?.sizeBytes ?? 0);

  if (!ACCEPTED_VIDEO_MIME.has(mimeType)) {
    return NextResponse.json({ error: `この形式の動画は判定できません（${mimeType || "不明"}）` }, { status: 400 });
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_VIDEO_BYTES) {
    return NextResponse.json(
      { error: `動画は ${formatBytes(MAX_VIDEO_BYTES)} 以内にしてください` },
      { status: 413 },
    );
  }

  try {
    return NextResponse.json(await createUploadTarget(mimeType));
  } catch (error) {
    console.error("[uploads]", error);
    return NextResponse.json({ error: "アップロード先を用意できませんでした" }, { status: 503 });
  }
}
