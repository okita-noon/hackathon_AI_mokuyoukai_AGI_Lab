import { FileState, GoogleGenAI, type File as GenAIFile, type Part } from "@google/genai";
import { analyzedSeconds, samplingFps, MAX_ANALYZED_SECONDS, type MediaMeta } from "./media-rules";
import { readObject } from "./storage";
import type { Engine } from "./types";

/**
 * 動画・写真を Gemini が読める Part に変換する。
 *
 * 動画の届け方はエンジンと保存先で変わる。
 *  1. Vertex AI + gs://   … fileData でURIをそのまま渡す（本番。動画がアプリを経由しない）
 *  2. Gemini API + gs://  … Files API に上げ直し、ACTIVE になってから渡す
 *  3. base64 inline       … 8MB以下の小さいファイルと写真
 *
 * どの経路でも渡せなかった場合は例外にする。動画を見ないまま判定させると、
 * 「証拠を出したのに認められない」が起きて、そのまま罰金に向かってしまう。
 */

export type MediaSource = {
  mimeType: string;
  /** GCSに直接アップロードされた動画 */
  storageUri?: string | null;
  /** リクエストに載ってきた base64（写真・小さい動画） */
  base64?: string | null;
  meta?: MediaMeta | null;
};

/** Files API 上のファイルは48時間残る。同じ動画を上げ直さないよう控えておく */
const FILES_API_TTL_MS = 40 * 60 * 60 * 1000;
const uploaded = new Map<string, { fileUri: string; mimeType: string; expiresAt: number }>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function isVideo(mimeType?: string | null): boolean {
  return Boolean(mimeType?.startsWith("video/"));
}

/** 動画をどう見るかの指定。回数を数えるために、短い動画ほどコマを細かく取る */
function videoMetadata(meta?: MediaMeta | null) {
  const { truncated } = analyzedSeconds(meta?.durationSec);
  return {
    fps: samplingFps(meta?.durationSec),
    ...(truncated ? { endOffset: `${MAX_ANALYZED_SECONDS}s` } : {}),
  };
}

export async function toParts(client: GoogleGenAI, engine: Engine, source: MediaSource): Promise<Part[]> {
  const video = isVideo(source.mimeType);
  const extra = video ? { videoMetadata: videoMetadata(source.meta) } : {};

  if (source.storageUri) {
    if (engine === "vertex") {
      return [{ fileData: { fileUri: source.storageUri, mimeType: source.mimeType }, ...extra }];
    }
    // Gemini API は gs:// を読めないので、一度取り出して Files API に載せ替える
    const bytes = await readObject(source.storageUri);
    const fileData = await uploadToFilesApi(client, bytes, source.mimeType, source.storageUri);
    return [{ fileData, ...extra }];
  }

  if (source.base64) {
    return [{ inlineData: { mimeType: source.mimeType, data: source.base64 }, ...extra }];
  }

  throw new Error("エビデンスを読み込めませんでした");
}

async function uploadToFilesApi(
  client: GoogleGenAI,
  bytes: Buffer,
  mimeType: string,
  cacheKey: string,
): Promise<{ fileUri: string; mimeType: string }> {
  const cached = uploaded.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return { fileUri: cached.fileUri, mimeType: cached.mimeType };

  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const file = await client.files.upload({ file: new Blob([body], { type: mimeType }), config: { mimeType } });
  const ready = await waitUntilActive(client, file);
  if (!ready.uri) throw new Error("Files API がファイルURIを返しませんでした");

  const result = { fileUri: ready.uri, mimeType: ready.mimeType ?? mimeType };
  uploaded.set(cacheKey, { ...result, expiresAt: Date.now() + FILES_API_TTL_MS });
  return result;
}

/** 動画はアップロード直後 PROCESSING で、そのまま渡すと失敗する */
async function waitUntilActive(client: GoogleGenAI, file: GenAIFile): Promise<GenAIFile> {
  const deadline = Date.now() + 90_000;
  let current = file;
  while (current.state === FileState.PROCESSING) {
    if (Date.now() > deadline) throw new Error("動画の前処理が終わりませんでした。短く撮り直してください");
    await sleep(2000);
    if (!current.name) throw new Error("Files API がファイル名を返しませんでした");
    current = await client.files.get({ name: current.name });
  }
  if (current.state === FileState.FAILED) {
    throw new Error("この形式の動画をGeminiが読めませんでした。mp4で撮り直してください");
  }
  return current;
}
