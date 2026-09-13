"use client";

import { useRef, useState } from "react";
import type { Promise as Contract, Verdict, Engine } from "@/lib/types";
import { Button, EngineBadge, Heading, OkanBubble } from "./ui";

type Props = {
  contract: Contract;
  onReset: () => void;
};

/** Geminiにインラインで渡せる現実的な上限。これを超えたらフレームだけ送る */
const MAX_INLINE_VIDEO_BYTES = 8 * 1024 * 1024;
const FRAME_COUNT = 3;

export function Watch({ contract, onReset }: Props) {
  const [preview, setPreview] = useState<{ url: string; isVideo: boolean } | null>(null);
  const [verdict, setVerdict] = useState<(Verdict & { engine: Engine; analyzed?: string }) | null>(null);
  const [scold, setScold] = useState<{ okan: string; engine: Engine } | null>(null);
  const [busy, setBusy] = useState<"judge" | "scold" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function judge(file: File) {
    const isVideo = file.type.startsWith("video/");
    const dataUrl = await toDataUrl(file);
    setPreview({ url: dataUrl, isVideo });
    setVerdict(null);
    setBusy("judge");
    try {
      // 動画はブラウザ側でコマを抜き出しておく。動画を扱えないモデルでも判定できるようにするため
      const frames = isVideo
        ? await extractFrames(file, FRAME_COUNT)
        : [{ mimeType: file.type || "image/jpeg", base64: dataUrl.split(",")[1] }];

      const video =
        isVideo && file.size <= MAX_INLINE_VIDEO_BYTES
          ? { mimeType: file.type, base64: dataUrl.split(",")[1] }
          : undefined;

      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ video, frames, promise: contract }),
      });
      setVerdict(await res.json());
    } finally {
      setBusy(null);
    }
  }

  async function timeUp() {
    setBusy("scold");
    try {
      const res = await fetch("/api/okan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "scold", promise: contract }),
      });
      setScold(await res.json());
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
      <Heading lead="証拠を提出するまで、AIおかんは認めません。">監視</Heading>

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
            capture="environment"
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
        </div>

        <div className="min-h-56">
          {busy === "judge" && (
            <p aria-live="polite" className="text-muted">AIおかんが写真を確認しています…</p>
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

function toDataUrl(file: File): Promise<string> {
  return new window.Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
