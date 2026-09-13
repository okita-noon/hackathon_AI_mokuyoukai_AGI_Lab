import { randomUUID } from "node:crypto";

/**
 * 動画エビデンス用の Cloud Storage 操作。
 *
 * 動画は base64 でリクエストに載せると Cloud Run のリクエスト上限(32MB)を超えるため、
 * ブラウザから署名付きURLで直接アップロードし、アプリは gs:// のURIだけを扱う。
 * 判定が終わったオブジェクトは消す（このアプリはエビデンス本体を保存しない方針）。
 */

export function bucketName(): string {
  return process.env.GCS_BUCKET ?? "";
}

export function storageEnabled(): boolean {
  return Boolean(bucketName());
}

const EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/mpeg": "mpeg",
  "video/x-matroska": "mkv",
  "video/3gpp": "3gp",
  "video/x-msvideo": "avi",
  "video/x-ms-wmv": "wmv",
  "video/x-flv": "flv",
};

/** Gemini がそのまま解釈できる動画の MIME。端末によって出てくる種類が違う */
export const ACCEPTED_VIDEO_MIME = new Set(Object.keys(EXT));

async function bucket() {
  const { Storage } = await import("@google-cloud/storage");
  return new Storage().bucket(bucketName());
}

export type UploadTarget = { uploadUrl: string; storageUri: string };

/** 15分・PUT限定・Content-Type固定の署名付きURLを払い出す */
export async function createUploadTarget(mimeType: string): Promise<UploadTarget> {
  const objectPath = `okan-proofs/${randomUUID()}.${EXT[mimeType] ?? "bin"}`;
  const [uploadUrl] = await (await bucket()).file(objectPath).getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000,
    contentType: mimeType,
  });
  return { uploadUrl, storageUri: `gs://${bucketName()}/${objectPath}` };
}

function parse(storageUri: string): { bucket: string; path: string } | null {
  if (!storageUri.startsWith("gs://")) return null;
  const rest = storageUri.slice(5);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  return { bucket: rest.slice(0, slash), path: rest.slice(slash + 1) };
}

/** アップロードが本当に完了しているかを、本体をダウンロードせずに確かめる */
export async function statObject(storageUri: string): Promise<{ sizeBytes: number; md5: string | null } | null> {
  const ref = parse(storageUri);
  if (!ref) return null;
  const { Storage } = await import("@google-cloud/storage");
  try {
    const [meta] = await new Storage().bucket(ref.bucket).file(ref.path).getMetadata();
    return { sizeBytes: Number(meta.size ?? 0), md5: meta.md5Hash ? String(meta.md5Hash) : null };
  } catch (error) {
    if ((error as { code?: number })?.code === 404) return null;
    throw error;
  }
}

export async function readObject(storageUri: string): Promise<Buffer> {
  const ref = parse(storageUri);
  if (!ref) throw new Error("gs:// のURIではありません");
  const { Storage } = await import("@google-cloud/storage");
  const [buf] = await new Storage().bucket(ref.bucket).file(ref.path).download();
  return buf;
}

/** 判定が終わったら消す。失敗しても判定結果は返したいので投げない */
export async function deleteObject(storageUri: string): Promise<void> {
  const ref = parse(storageUri);
  if (!ref) return;
  try {
    const { Storage } = await import("@google-cloud/storage");
    await new Storage().bucket(ref.bucket).file(ref.path).delete({ ignoreNotFound: true });
  } catch (error) {
    console.error("[storage] delete failed", error);
  }
}

/** アプリが払い出したオブジェクトかどうか。任意の gs:// を読ませないための確認 */
export function isOwnObject(storageUri: string): boolean {
  const ref = parse(storageUri);
  return !!ref && ref.bucket === bucketName() && ref.path.startsWith("okan-proofs/");
}
