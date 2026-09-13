/**
 * ブラウザ側だけで動く証跡ファイルのユーティリティ。
 * DOM API に依存するので、サーバーと共有する定数（lib/media.ts）とは分けている。
 */
import type { MediaMeta } from "./media";

/**
 * 動画・音声の尺と解像度をブラウザで測る。
 * サーバーで動画をデコードせずに済ませるための計測で、判定AIには「どこまでを何コマで見たか」を
 * 伝えるために使う。読めない端末・形式でも提出自体は止めない。
 */
export function readMediaMeta(file: File): Promise<MediaMeta> {
  const base: MediaMeta = { size_bytes: file.size };
  const isAv = file.type.startsWith("video/") || file.type.startsWith("audio/");
  if (!isAv) return Promise.resolve(base);

  return new Promise((resolve) => {
    const el = document.createElement(file.type.startsWith("video/") ? "video" : "audio") as HTMLVideoElement;
    const url = URL.createObjectURL(file);
    let settled = false;
    const done = (extra: Partial<MediaMeta>) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve({ ...base, ...extra });
    };
    el.preload = "metadata";
    el.onloadedmetadata = () =>
      done({
        duration_sec: Number.isFinite(el.duration) ? Math.round(el.duration) : null,
        width: el.videoWidth || null,
        height: el.videoHeight || null,
      });
    el.onerror = () => done({});
    setTimeout(() => done({}), 5000); // メタデータを返さない端末で止まらないようにする
    el.src = url;
  });
}

/** 大きな動画は進捗が見えないと固まったように見えるため、fetch ではなく XHR で送る */
export function uploadWithProgress(url: string, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`アップロードに失敗しました (HTTP ${xhr.status})`));
    xhr.onerror = () => reject(new Error("アップロードに失敗しました。通信状況を確認してください。"));
    xhr.send(file);
  });
}
