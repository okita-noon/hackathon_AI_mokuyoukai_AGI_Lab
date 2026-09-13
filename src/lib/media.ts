/**
 * 動画・音声証跡の共通ルール。
 *
 * 提出前のブラウザ側チェックと、サーバー側の最終検査の両方から読むため、
 * ここには process.env やサーバー専用の依存を置かない（クライアントバンドルに載る）。
 */

/** 1件の証跡ファイルの上限。GCSへ直接PUTするので Cloud Run の 32MB 制限は掛からない */
export const MAX_EVIDENCE_BYTES = 200 * 1024 * 1024;

/**
 * 1本の動画で Gemini に解析させる上限秒数。
 * これを超える動画は先頭から MAX_ANALYZED_SECONDS 秒だけを見る（endOffset で切る）。
 * 判定の入力が切り詰められたことは facts とユーザー向け文言の両方で明示する。
 */
export const MAX_ANALYZED_SECONDS = 600;

/** 短い動画は密にサンプリングする。素早い動作（フォーム確認など）の見落としを減らす */
export const SHORT_VIDEO_SECONDS = 60;
export const SHORT_VIDEO_FPS = 2;
export const DEFAULT_VIDEO_FPS = 1;

/** ブラウザが計測してサーバーへ送る動画・音声のメタ情報。欠けていても判定は続行する */
export type MediaMeta = {
  duration_sec?: number | null;
  width?: number | null;
  height?: number | null;
  size_bytes?: number | null;
};

export type VideoSampling = {
  /** Gemini に渡すフレームレート */
  fps: number;
  /** 実際に解析される秒数。尺が不明なら null */
  analyzedSeconds: number | null;
  /** 尺が上限を超えており、先頭だけを解析すること */
  truncated: boolean;
};

/**
 * 動画の尺からサンプリング条件を決める。
 * 尺が不明（ブラウザがメタデータを読めなかった）ときは既定の 1fps・切り詰めなしで扱う。
 */
export function videoSampling(meta?: MediaMeta | null): VideoSampling {
  const duration = Number(meta?.duration_sec ?? 0);
  if (!Number.isFinite(duration) || duration <= 0) {
    return { fps: DEFAULT_VIDEO_FPS, analyzedSeconds: null, truncated: false };
  }
  const truncated = duration > MAX_ANALYZED_SECONDS;
  const analyzedSeconds = truncated ? MAX_ANALYZED_SECONDS : Math.round(duration);
  return {
    fps: duration <= SHORT_VIDEO_SECONDS ? SHORT_VIDEO_FPS : DEFAULT_VIDEO_FPS,
    analyzedSeconds,
    truncated,
  };
}

export function formatDuration(sec?: number | null): string {
  if (!sec || !Number.isFinite(sec)) return "不明";
  const s = Math.round(sec);
  return s < 60 ? `${s}秒` : `${Math.floor(s / 60)}分${String(s % 60).padStart(2, "0")}秒`;
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes || !Number.isFinite(bytes)) return "不明";
  const mb = bytes / (1024 * 1024);
  return mb < 1 ? `${Math.round(bytes / 1024)}KB` : `${mb.toFixed(1)}MB`;
}
