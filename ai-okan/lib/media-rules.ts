/**
 * 動画エビデンスの扱いを決めるルール。
 * ブラウザ（提出前のチェック）とサーバー（判定条件）の両方から読むので、
 * ここには Node 専用の依存を置かない。
 */

/** 1本あたりの上限。GCSへ直接アップロードするので Cloud Run の 32MB 制限は掛からない */
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

/**
 * リクエストのJSONに base64 で載せられる上限。
 * Cloud Run のリクエスト上限が 32MB、base64 は約1.33倍になるため余裕を持たせる。
 * これを超える動画は署名付きURLでGCSへ直接上げる。
 */
export const MAX_INLINE_BYTES = 8 * 1024 * 1024;

/** これより長い動画は先頭だけを解析する */
export const MAX_ANALYZED_SECONDS = 600;

export type MediaMeta = {
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
  sizeBytes?: number | null;
};

/**
 * サンプリングの段階。
 * 実測（10.7秒・腕立て10回の実機動画）では 4コマ/秒だと同じ動画で 6〜10回とぶれ、
 * 10コマ/秒では3回連続で 10回に一致した。回数を数えるには1回あたり10コマ前後が要る。
 */
export const COUNTABLE_VIDEO_SECONDS = 20;
export const COUNTABLE_VIDEO_FPS = 10;
export const SHORT_VIDEO_SECONDS = 60;
export const SHORT_VIDEO_FPS = 4;
export const DEFAULT_VIDEO_FPS = 1;

/**
 * 動画を何コマ/秒で見るか。
 *
 * 「腕立て10回」のような回数の判定では、コマが粗いと1回の上下動を跨いで数え落とす。
 * 20秒以下は 10コマ/秒（10秒の動画で約100コマ）。VIDEO_FPS で上書きできる（lib/media.ts）。
 */
export function samplingFps(durationSec?: number | null): number {
  const d = Number(durationSec ?? 0);
  if (!Number.isFinite(d) || d <= 0) return SHORT_VIDEO_FPS; // 尺不明。数えられる程度には密にしておく
  if (d <= COUNTABLE_VIDEO_SECONDS) return COUNTABLE_VIDEO_FPS;
  if (d <= SHORT_VIDEO_SECONDS) return SHORT_VIDEO_FPS;
  return DEFAULT_VIDEO_FPS;
}

export function analyzedSeconds(durationSec?: number | null): { seconds: number | null; truncated: boolean } {
  const d = Number(durationSec ?? 0);
  if (!Number.isFinite(d) || d <= 0) return { seconds: null, truncated: false };
  return d > MAX_ANALYZED_SECONDS
    ? { seconds: MAX_ANALYZED_SECONDS, truncated: true }
    : { seconds: Math.round(d), truncated: false };
}

export function formatDuration(sec?: number | null): string {
  if (!sec || !Number.isFinite(sec)) return "長さ不明";
  const s = Math.round(sec);
  return s < 60 ? `${s}秒` : `${Math.floor(s / 60)}分${String(s % 60).padStart(2, "0")}秒`;
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes || !Number.isFinite(bytes)) return "サイズ不明";
  const mb = bytes / (1024 * 1024);
  return mb < 1 ? `${Math.round(bytes / 1024)}KB` : `${mb.toFixed(1)}MB`;
}

/**
 * 約束の文面から「何回やると約束したか」を読む。
 * モデルの申告だけに頼らず、アプリ側でも同じ数字を持っておくために使う。
 */
export function requiredCount(text: string): number | null {
  const normalized = text.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const match = normalized.match(/(\d+)\s*(回|rep|reps|セット)/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 && n <= 10000 ? n : null;
}
