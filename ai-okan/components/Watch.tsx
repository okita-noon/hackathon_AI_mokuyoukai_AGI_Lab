"use client";

import { useRef, useState } from "react";
import type { Promise as Contract, Verdict, Engine } from "@/lib/types";
import { MAX_INLINE_BYTES, MAX_VIDEO_BYTES, formatBytes, type MediaMeta } from "@/lib/media-rules";
import { Button, EngineBadge, Heading, OkanBubble } from "./ui";

type Props = {
  contract: Contract;
  onReset: () => void;
};

const FRAME_COUNT = 3;

export function Watch({ contract, onReset }: Props) {
  const [preview, setPreview] = useState<{ url: string; isVideo: boolean } | null>(null);
  const [verdict, setVerdict] = useState<(Verdict & { engine: Engine; analyzed?: string }) | null>(null);
  const [scold, setScold] = useState<{ okan: string; engine: Engine } | null>(null);
  const [busy, setBusy] = useState<"judge" | "scold" | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function judge(file: File) {
    const isVideo = file.type.startsWith("video/");
    if (file.size > MAX_VIDEO_BYTES) {
      setError(`ファイルが大きすぎます（${formatBytes(file.size)}）。${formatBytes(MAX_VIDEO_BYTES)} 以内にしてください`);
      return;
    }

    setPreview({ url: URL.createObjectURL(file), isVideo });
    setVerdict(null);
    setError(null);
    setNote(null);
    setBusy("judge");
    try {
      const meta = isVideo ? await readVideoMeta(file) : { sizeBytes: file.size };
      // 動画はできるだけ「動画のまま」おかんに見せる。回数は連続したコマでしか数えられない
      const uploaded = isVideo ? await uploadToStorage(file, setProgress) : null;
      setProgress(null);

      const payload: Record<string, unknown> = { promise: contract, mediaMeta: meta };
      if (uploaded?.storageUri) {
        payload.storageUri = uploaded.storageUri;
        payload.mimeType = file.type;
        // 動画を読めないエンジンに切り替わっていた場合の保険。数百KBなので付けておく
        payload.frames = await extractFrames(file, FRAME_COUNT);
      } else if (uploaded?.fileName) {
        payload.fileName = uploaded.fileName;
        payload.mimeType = file.type;
        payload.frames = await extractFrames(file, FRAME_COUNT);
      } else if (isVideo) {
        // リクエストに載せられる大きさのときだけ base64 にする（大きい動画で端末を固まらせない）
        if (file.size <= MAX_INLINE_BYTES) {
          payload.video = { mimeType: file.type, base64: (await toDataUrl(file)).split(",")[1] };
        } else {
          setNote("この環境では動画をそのまま送れないため、抜き出したコマで判定します。回数までは数えられません。");
        }
        // 動画を扱えないモデル向けの保険。静止画では数えられないので、あくまで最後の手段
        payload.frames = await extractFrames(file, FRAME_COUNT);
      } else {
        payload.frames = [{ mimeType: file.type || "image/jpeg", base64: (await toDataUrl(file)).split(",")[1] }];
      }

      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "証拠を判定できませんでした");
      setVerdict(json);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "証拠を判定できませんでした");
    } finally {
      setProgress(null);
      setBusy(null);
    }
  }

  async function timeUp() {
    setBusy("scold");
    setError(null);
    try {
      const res = await fetch("/api/okan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "scold", promise: contract }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "期限切れを記録できませんでした");
      setScold(json);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "期限切れを記録できませんでした");
    } finally {
      setBusy(null);
    }
  }

  if (scold) {
    return (
      <div className="space-y-8 text-center">
        <p className="text-sm font-bold tracking-widest text-muted">期限切れ</p>
        <p className="text-6xl font-bold text-danger tabular-nums sm:text-7xl">
          ¥{contract.penalty.toLocaleString()}
        </p>
        <p className="text-lg font-bold">罰金が発動しました</p>
        <div className="mx-auto max-w-2xl text-left">
          <OkanBubble text={scold.okan} tone="angry" />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <EngineBadge engine={scold.engine} />
        </div>
        <Button variant="secondary" onClick={onReset}>
          もう一度、約束をやり直す
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Heading lead="証拠を出すまでは、おかんは納得しません。">見守り</Heading>

      <dl className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
        {[
          { k: "約束", v: contract.goal },
          { k: "期限", v: contract.deadline },
          { k: "証拠", v: contract.evidence },
          { k: "罰金", v: `¥${contract.penalty.toLocaleString()}` },
        ].map((r) => (
          <div key={r.k} className="bg-white p-4">
            <dt className="bg-bg-soft px-2 py-0.5 text-xs font-bold text-muted">{r.k}</dt>
            <dd className="mt-2 font-bold">{r.v}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-4">
          <div
            onClick={() => fileRef.current?.click()}
            className="grid h-56 cursor-pointer place-items-center overflow-hidden rounded-xl border-2 border-dashed border-line-strong bg-bg-soft text-center transition hover:bg-bg-soft"
          >
            {preview ? (
              // 提出された証拠のプレビュー
              preview.isVideo ? (
                <video src={preview.url} controls playsInline className="size-full object-cover" />
              ) : (
                <img src={preview.url} alt="提出した証拠" className="size-full object-cover" />
              )
            ) : (
              <div className="space-y-2 px-6">
                <p className="font-bold">証拠の写真・動画を出す</p>
                <p className="text-xs text-muted">タップして撮影／ファイルを選ぶ</p>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            // capture を付けるとスマホでカメラ起動に固定され、撮り置きの動画を選べなくなる
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) judge(f);
            }}
          />
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => fileRef.current?.click()} disabled={busy !== null}>
              {busy === "judge" ? "判定しています…" : "証拠を提出する"}
            </Button>
            <Button variant="secondary" onClick={timeUp} disabled={busy !== null}>
              {busy === "scold" ? "…" : "期限切れにする（デモ用）"}
            </Button>
          </div>
          {progress !== null && (
            <div className="space-y-1">
              <p className="text-xs font-bold text-muted">動画を送っています… {progress}%</p>
              <div className="h-2 overflow-hidden rounded-xl border border-line bg-white">
                <div className="h-full bg-fg transition-[width]" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          {note && <p className="text-xs text-muted">{note}</p>}
          {error && <p role="alert" className="text-sm font-bold text-danger">{error}</p>}
        </div>

        <div className="min-h-56">
          {busy === "judge" && (
            <p aria-live="polite" className="text-muted">
              {progress !== null ? "動画を送っています…" : "AIおかんが証拠を確認しています…"}
            </p>
          )}
          {verdict && (
            <div className="rise space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <VerdictChip verdict={verdict.verdict} />
                <EngineBadge engine={verdict.engine} />
              </div>
              {verdict.analyzed && (
                <p className="text-xs text-muted">解析対象：{verdict.analyzed}</p>
              )}
              {typeof verdict.counted === "number" && (
                // 回数が条件の約束では、ここが判定の核心になる
                <p className="text-sm font-bold">
                  数えられた回数：{verdict.counted}回
                  {typeof verdict.required === "number" && ` / 約束は${verdict.required}回`}
                </p>
              )}
              <p className="text-sm text-muted">
                AIおかんが見たもの：{verdict.whatISee}
              </p>
              <OkanBubble text={verdict.okan} tone={verdict.verdict === "ok" ? "normal" : "angry"} />
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted">証拠としての信頼度 {verdict.score} / 100</p>
                <div className="h-3 overflow-hidden rounded-xl border border-line bg-white">
                  <div
                    className={`h-full ${verdict.verdict === "ok" ? "bg-ok" : "bg-danger"}`}
                    style={{ width: `${verdict.score}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VerdictChip({ verdict }: { verdict: Verdict["verdict"] }) {
  const map = {
    ok: { label: "認めたる", cls: "border-ok bg-ok text-white" },
    suspicious: { label: "怪しい", cls: "border-line-strong bg-bg-soft text-fg" },
    ng: { label: "話にならん", cls: "border-danger bg-danger text-white" },
  }[verdict];
  return (
    <span className={`border-2 px-4 py-1 text-sm font-bold ${map.cls}`}>
      {map.label}
    </span>
  );
}

/** 動画から等間隔でコマを抜き出し、JPEGのbase64にして返す */
async function extractFrames(file: File, count: number): Promise<{ mimeType: string; base64: string }[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("動画を読み込めませんでした"));
    });

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
    const scale = Math.min(1, 640 / (video.videoWidth || 640));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round((video.videoWidth || 640) * scale);
    canvas.height = Math.round((video.videoHeight || 360) * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];

    const frames: { mimeType: string; base64: string }[] = [];
    for (let i = 0; i < count; i++) {
      // 端は真っ暗なことがあるので、両端を少し内側に寄せる
      const t = duration * ((i + 0.5) / count);
      await seek(video, Math.min(t, Math.max(0, duration - 0.05)));
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({
        mimeType: "image/jpeg",
        base64: canvas.toDataURL("image/jpeg", 0.7).split(",")[1],
      });
    }
    return frames;
  } catch {
    return [];
  } finally {
    URL.revokeObjectURL(url);
  }
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new window.Promise((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done);
    video.currentTime = time;
  });
}

/**
 * 動画本体を「動画のまま」判定に回せる場所へ置く。
 *  1. GCS の署名付きURL（本番）
 *  2. それが無い環境では、サーバー経由で Gemini の Files API（APIキー運用のローカル）
 * どちらも使えない場合は null を返し、呼び出し側が base64／静止画の経路に落ちる。
 */
async function uploadToStorage(
  file: File,
  onProgress: (percent: number | null) => void,
): Promise<{ storageUri?: string; fileName?: string } | null> {
  const res = await fetch("/api/uploads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size }),
  });
  const json = await res.json();

  if (res.status === 501) {
    if (!json.filesApi) return null;
    const uploaded = await putWithProgress("/api/uploads", file, onProgress);
    return { fileName: uploaded.fileName };
  }
  if (!res.ok) throw new Error(json.error ?? "アップロード先を用意できませんでした");

  await putWithProgress(json.uploadUrl, file, onProgress);
  return { storageUri: json.storageUri };
}

/** 大きな動画は進捗が見えないと固まったように見えるため、fetch ではなく XHR で送る */
function putWithProgress(
  url: string,
  file: File,
  onProgress: (percent: number | null) => void,
): Promise<Record<string, string>> {
  onProgress(0);
  return new window.Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`動画をアップロードできませんでした (HTTP ${xhr.status})`));
        return;
      }
      try {
        resolve(xhr.responseText ? JSON.parse(xhr.responseText) : {});
      } catch {
        resolve({}); // GCSはXMLを返す。本文は使わない
      }
    };
    xhr.onerror = () => reject(new Error("動画をアップロードできませんでした。通信状況を確かめてください"));
    xhr.send(file);
  });
}

/** 尺と解像度をブラウザで測る。何コマ/秒で解析するかの判断に使う */
function readVideoMeta(file: File): Promise<MediaMeta> {
  return new window.Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    let settled = false;
    const done = (extra: Partial<MediaMeta>) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve({ sizeBytes: file.size, ...extra });
    };
    video.preload = "metadata";
    video.onloadedmetadata = () =>
      done({
        durationSec: Number.isFinite(video.duration) ? Math.round(video.duration) : null,
        width: video.videoWidth || null,
        height: video.videoHeight || null,
      });
    video.onerror = () => done({});
    setTimeout(() => done({}), 5000); // メタデータを返さない端末で止まらないようにする
    video.src = url;
  });
}

function toDataUrl(file: File): Promise<string> {
  return new window.Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
