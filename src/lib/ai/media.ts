import { FileState, type File as GenAIFile, type Part, type VideoMetadata } from "@google/genai";
import { genaiClient } from "./client";
import { env } from "../env";
import { readObject } from "../storage";
import { MAX_ANALYZED_SECONDS, videoSampling, type MediaMeta } from "../media";

/**
 * 証跡ファイルを Gemini に渡せる Part に変換する。
 *
 * 動画は数十〜数百MBになるため、経路を3つ用意して「必ず本物の動画がモデルに届く」状態にする。
 *  1. Vertex AI + gs://  … fileData で GCS のURIをそのまま渡す（本番。Cloud Run にダウンロードしない）
 *  2. Gemini API + 動画/音声 … Files API にアップロードして fileUri で渡す（ローカル開発・APIキー運用）
 *  3. それ以外（画像など小さいもの） … inlineData で base64 送信
 *
 * 以前は 1 の条件から外れた動画が「メディアなし」で判定に流れ、AIが見ていない動画を
 * 未達と判定し得た。ここでは読めなかった場合に必ず例外にして、無証拠判定を防ぐ。
 */

export type EvidenceFile = {
  mimeType: string;
  /** すでにメモリ上にある場合のみ。動画では基本的に使わない */
  bytes?: Buffer;
  /** gs://bucket/path または local://path */
  storageUri?: string | null;
  meta?: MediaMeta | null;
};

/** inlineData の上限。Gemini API はリクエスト全体で 20MB のため余裕を持たせる */
const INLINE_MAX_BYTES = 15 * 1024 * 1024;

/** Files API 上のファイルは48時間保持される。異議申し立ての再判定で上げ直さないよう控えておく */
const FILES_API_TTL_MS = 40 * 60 * 60 * 1000;
const uploadCache = new Map<string, { fileUri: string; mimeType: string; expiresAt: number }>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function isVideo(mimeType?: string | null): boolean {
  return Boolean(mimeType?.startsWith("video/"));
}

export function isAudio(mimeType?: string | null): boolean {
  return Boolean(mimeType?.startsWith("audio/"));
}

/**
 * 動画の解析条件。長すぎる動画は先頭だけを見る（endOffset）。
 * 尺が分かっている短い動画は fps を上げて、一瞬の動作も拾えるようにする。
 */
function buildVideoMetadata(meta?: MediaMeta | null): VideoMetadata | undefined {
  const s = videoSampling(meta);
  const md: VideoMetadata = { fps: s.fps };
  if (s.truncated) md.endOffset = `${MAX_ANALYZED_SECONDS}s`;
  return md;
}

export async function resolveMediaParts(file?: EvidenceFile | null): Promise<Part[]> {
  if (!file?.mimeType) return [];
  const videoMetadata = isVideo(file.mimeType) ? buildVideoMetadata(file.meta) : undefined;

  // 1) Vertex AI は gs:// をそのまま読める。動画をアプリのメモリに載せない最短経路
  if (env.useVertex && file.storageUri?.startsWith("gs://")) {
    return [{ fileData: { fileUri: file.storageUri, mimeType: file.mimeType }, ...(videoMetadata && { videoMetadata }) }];
  }

  const bytes = file.bytes ?? (file.storageUri ? await readObject(file.storageUri) : undefined);
  if (!bytes?.length) {
    throw new Error("証跡ファイルを読み込めませんでした。アップロードからやり直してください。");
  }

  // 2) APIキー運用では Files API 経由。動画・音声は inlineData の上限を超えるのが普通
  if (!env.useVertex && (isVideo(file.mimeType) || isAudio(file.mimeType) || bytes.length > INLINE_MAX_BYTES)) {
    const fileData = await uploadToFilesApi(bytes, file.mimeType, file.storageUri ?? null);
    return [{ fileData, ...(videoMetadata && { videoMetadata }) }];
  }

  if (bytes.length > INLINE_MAX_BYTES) {
    // Vertex AI + ローカル保存の組み合わせだけがここに来る（本番構成では起きない）
    throw new Error(
      `ファイルが大きすぎて判定に渡せません（${Math.round(bytes.length / 1024 / 1024)}MB）。` +
        "STORAGE_DRIVER=gcs を設定して Cloud Storage 経由で提出してください。",
    );
  }
  return [{ inlineData: { mimeType: file.mimeType, data: bytes.toString("base64") }, ...(videoMetadata && { videoMetadata }) }];
}

/**
 * Gemini API の Files API にアップロードし、解析可能（ACTIVE）になるまで待つ。
 * 動画はアップロード直後 PROCESSING で、そのまま generateContent に渡すと失敗する。
 */
async function uploadToFilesApi(
  bytes: Buffer,
  mimeType: string,
  cacheKey: string | null,
): Promise<{ fileUri: string; mimeType: string }> {
  const cached = cacheKey ? uploadCache.get(cacheKey) : undefined;
  if (cached && cached.expiresAt > Date.now()) return { fileUri: cached.fileUri, mimeType: cached.mimeType };

  const ai = genaiClient();
  // Buffer をそのまま渡すと ArrayBufferLike が混ざるため、ArrayBuffer に写してから Blob にする
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([body], { type: mimeType });
  const uploaded = await ai.files.upload({ file: blob, config: { mimeType } });
  const ready = await waitUntilActive(uploaded);
  if (!ready.uri) throw new Error("Files API がファイルURIを返しませんでした");

  const result = { fileUri: ready.uri, mimeType: ready.mimeType ?? mimeType };
  if (cacheKey) uploadCache.set(cacheKey, { ...result, expiresAt: Date.now() + FILES_API_TTL_MS });
  return result;
}

async function waitUntilActive(file: GenAIFile): Promise<GenAIFile> {
  const ai = genaiClient();
  const deadline = Date.now() + 90_000; // 動画の前処理は尺に比例して伸びる
  let current = file;
  while (current.state === FileState.PROCESSING) {
    if (Date.now() > deadline) {
      throw new Error("動画の前処理がタイムアウトしました。短く切ってから提出してください。");
    }
    await sleep(2000);
    if (!current.name) throw new Error("Files API がファイル名を返しませんでした");
    current = await ai.files.get({ name: current.name });
  }
  if (current.state === FileState.FAILED) {
    throw new Error(`動画をGeminiが読み込めませんでした（${current.error?.message ?? "FAILED"}）。別の形式で試してください。`);
  }
  return current;
}
