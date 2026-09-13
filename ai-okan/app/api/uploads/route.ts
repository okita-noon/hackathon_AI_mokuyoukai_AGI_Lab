import { NextResponse } from "next/server";
import { ACCEPTED_VIDEO_MIME, createUploadTarget, storageEnabled } from "@/lib/storage";
import { MAX_VIDEO_BYTES, formatBytes } from "@/lib/media-rules";
import { client, detectEngine } from "@/lib/llm";
import { uploadVideoToFilesApi } from "@/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
    // GCSが無い環境では、APIキー運用に限り PUT（Files API 経由）に切り替えられる
    return NextResponse.json(
      { error: "この環境では直接アップロードを使えません", filesApi: detectEngine() === "gemini" },
      { status: 501 },
    );
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

/**
 * GCS が無い環境で、inline に載らない動画を Files API 経由で渡すための受け口。
 * 本体はここで一度だけ受け取り、ファイル名だけをクライアントへ返す
 * （URIとハッシュは判定時にサーバーが引き直すので、クライアントの申告は信用しない）。
 */
export async function PUT(req: Request) {
  const engine = detectEngine();
  if (engine !== "gemini") {
    return NextResponse.json({ error: "この環境ではこの経路を使えません" }, { status: 501 });
  }
  const mimeType = req.headers.get("content-type") ?? "";
  if (!ACCEPTED_VIDEO_MIME.has(mimeType)) {
    return NextResponse.json({ error: `この形式の動画は判定できません（${mimeType || "不明"}）` }, { status: 400 });
  }

  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_VIDEO_BYTES) {
    return NextResponse.json({ error: `動画は ${formatBytes(MAX_VIDEO_BYTES)} 以内にしてください` }, { status: 413 });
  }

  try {
    const uploaded = await uploadVideoToFilesApi(client(engine), bytes, mimeType);
    return NextResponse.json({ fileName: uploaded.name });
  } catch (error) {
    console.error("[uploads:files]", error);
    return NextResponse.json({ error: "動画をアップロードできませんでした" }, { status: 503 });
  }
}
