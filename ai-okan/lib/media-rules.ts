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
 * 動画を何コマ/秒で見るか。
 *
 * 「腕立て10回」のような回数の判定では、1コマ/秒だと1回の上下動を跨いでしまい数え落とす。
 * 短い動画ほど密に見る。15秒の動画なら 4fps = 60コマで、1回あたり4〜6コマ残る。
 */
export function samplingFps(durationSec?: number | null): number {
  const d = Number(durationSec ?? 0);
  if (!Number.isFinite(d) || d <= 0) return 2; // 尺不明。回数を数えられる程度には密にしておく
  if (d <= 30) return 4;
  if (d <= 60) return 2;
  return 1;
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
