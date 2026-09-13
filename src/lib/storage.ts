import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "./env";

const LOCAL_ROOT = path.join(process.cwd(), ".data", "uploads");

/** 拡張子は Vertex AI 側の判定に影響しないが、GCS 上で人が見て分かるようにしておく */
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic",
  // 動画は端末によって出てくる MIME がばらつく（iPhone=quicktime, Android=mp4/webm,
  // PCからの選択で mpeg/avi/wmv/flv/mkv）。Gemini が解釈できるものは全部受ける。
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/mpeg": "mpeg",
  "video/x-matroska": "mkv", "video/3gpp": "3gp", "video/x-msvideo": "avi",
  "video/x-ms-wmv": "wmv", "video/x-flv": "flv",
  "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/webm": "webm", "audio/wav": "wav",
};

/** Gemini がそのまま解釈できる MIME タイプ。ここにないものは受け付けない */
export const ACCEPTED_MIME = new Set(Object.keys(EXT));

/** 動画・音声は Cloud Run に落とさず gs:// のまま Vertex AI に渡す */
export function isLargeMedia(mimeType: string): boolean {
  return mimeType.startsWith("video/") || mimeType.startsWith("audio/");
}

export type UploadTarget = {
  objectPath: string; // DBに保存するキー（バケット名は含めない）
  uploadUrl: string;  // クライアントが PUT する先
  storageUri: string; // gs://... or local://...
};

/**
 * アップロード先を払い出す。
 * gcs ドライバでは V4 署名付きURL（15分・PUT限定・Content-Type固定）を返すので、
 * ファイル本体は Cloud Run を経由せず直接 GCS に載る（Cloud Run の 32MB 制限を回避）。
 */
export async function createUploadTarget(commitmentId: string, mimeType: string): Promise<UploadTarget> {
  const ext = EXT[mimeType] ?? (mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "bin");
  const objectPath = `proofs/${commitmentId}/${randomUUID()}.${ext}`;

  if (env.storageDriver === "gcs") {
    const { Storage } = await import("@google-cloud/storage");
    const storage = new Storage();
    const [uploadUrl] = await storage
      .bucket(env.gcsBucket)
      .file(objectPath)
      .getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + 15 * 60 * 1000,
        contentType: mimeType,
      });
    return { objectPath, uploadUrl, storageUri: `gs://${env.gcsBucket}/${objectPath}` };
  }

  // ローカル: GCPを一切用意しなくても同じフローで動かすためのフォールバック
  return {
    objectPath,
    uploadUrl: `/api/uploads/local?path=${encodeURIComponent(objectPath)}`,
    storageUri: `local://${objectPath}`,
  };
}

export async function putLocalObject(objectPath: string, bytes: Buffer): Promise<void> {
  const dest = path.join(LOCAL_ROOT, objectPath);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, bytes);
}

/** Gemini に inlineData で渡すため、保存済みの証拠バイト列を読み戻す */
export async function readObject(storageUri: string): Promise<Buffer> {
  if (storageUri.startsWith("gs://")) {
    const { Storage } = await import("@google-cloud/storage");
    const [, , ...rest] = storageUri.split("/");
    const bucket = storageUri.slice(5).split("/")[0];
    const objectPath = rest.slice(1).join("/");
    const [buf] = await new Storage().bucket(bucket).file(objectPath).download();
    return buf;
  }
  return readFile(path.join(LOCAL_ROOT, storageUri.replace("local://", "")));
}

export function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * ファイル本体をダウンロードせずにオブジェクトの状態を確かめる。
 * 動画のように数百MBあるものを Cloud Run のメモリに載せたくないため、
 * サイズ確認と重複検知（GCSが計算済みの md5）をメタデータだけで済ませる。
 * オブジェクトが存在しない（アップロードが完了していない）場合は null を返す。
 */
export async function statObject(
  storageUri: string,
): Promise<{ hash: string | null; hashSource: string; sizeBytes: number } | null> {
  if (!storageUri.startsWith("gs://")) return null;
  const { Storage } = await import("@google-cloud/storage");
  const bucket = storageUri.slice(5).split("/")[0];
  const objectPath = storageUri.slice(5 + bucket.length + 1);
  try {
    const [meta] = await new Storage().bucket(bucket).file(objectPath).getMetadata();
    return {
      hash: meta.md5Hash ? String(meta.md5Hash) : null,
      hashSource: meta.md5Hash ? "gcs-md5" : "none",
      sizeBytes: Number(meta.size ?? 0),
    };
  } catch (e: any) {
    if (e?.code === 404) return null;
    throw e;
  }
}

/** 2点間の距離(m)。Haversine。GPS判定は決定論的に計算し、AIには結果だけ渡す */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
