"use client";

import { useRef, useState } from "react";
import type { Promise as Contract, Verdict, Engine } from "@/lib/types";
import { Button, EngineBadge, OkanBubble } from "./ui";

type Props = {
  contract: Contract;
  onReset: () => void;
};

export function Watch({ contract, onReset }: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<(Verdict & { engine: Engine }) | null>(null);
  const [scold, setScold] = useState<{ okan: string; engine: Engine } | null>(null);
  const [busy, setBusy] = useState<"judge" | "scold" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function judge(file: File) {
    const dataUrl = await toDataUrl(file);
    setPreview(dataUrl);
    setVerdict(null);
    setBusy("judge");
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mimeType: file.type || "image/jpeg",
          base64: dataUrl.split(",")[1],
          promise: contract,
        }),
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
        <p className="slam text-7xl font-black text-accent sm:text-8xl">
          ¥{contract.penalty.toLocaleString()}
        </p>
        <p className="text-lg font-bold">罰金が発動しました</p>
        <div className="mx-auto max-w-2xl text-left">
          <OkanBubble text={scold.okan} tone="angry" />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <EngineBadge engine={scold.engine} />
        </div>
        <Button variant="ghost" onClick={onReset}>
          もう一回、約束しなおす
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h2 className="text-3xl font-black sm:text-4xl">監視</h2>
        <p className="text-muted">証拠を出すまで、おかんは信じひん。</p>
      </header>

      <dl className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
        {[
          { k: "約束", v: contract.goal },
          { k: "期限", v: contract.deadline },
          { k: "証拠", v: contract.evidence },
          { k: "罰金", v: `¥${contract.penalty.toLocaleString()}` },
        ].map((r) => (
          <div key={r.k} className="bg-bg-soft p-4">
            <dt className="text-[11px] font-bold tracking-widest text-muted">{r.k}</dt>
            <dd className="mt-1 font-bold">{r.v}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-4">
          <div
            onClick={() => fileRef.current?.click()}
            className="grid h-56 cursor-pointer place-items-center overflow-hidden rounded-2xl border border-dashed border-line bg-bg-soft text-center transition hover:border-muted"
          >
            {preview ? (
              // 提出された証拠のプレビュー
              <img src={preview} alt="提出した証拠" className="size-full object-cover" />
            ) : (
              <div className="space-y-2 px-6">
                <p className="text-3xl">📷</p>
                <p className="font-bold">証拠の写真を出す</p>
                <p className="text-xs text-muted">タップして撮影／ファイルを選ぶ</p>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) judge(f);
            }}
          />
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => fileRef.current?.click()} disabled={busy !== null}>
              {busy === "judge" ? "おかんが見とる…" : "証拠を提出する"}
            </Button>
            <Button variant="ghost" onClick={timeUp} disabled={busy !== null}>
              {busy === "scold" ? "…" : "期限が来てもうた"}
            </Button>
          </div>
        </div>

        <div className="min-h-56">
          {busy === "judge" && (
            <p className="blink text-muted">おかんが写真を確認しとる…</p>
          )}
          {verdict && (
            <div className="rise space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <VerdictChip verdict={verdict.verdict} />
                <EngineBadge engine={verdict.engine} />
              </div>
              <p className="text-sm text-muted">
                おかんが見たもの：{verdict.whatISee}
              </p>
              <OkanBubble text={verdict.okan} tone={verdict.verdict === "ok" ? "normal" : "angry"} />
              <div className="space-y-1">
                <p className="text-[11px] font-bold tracking-widest text-muted">
                  証拠としての信頼度 {verdict.score}
                </p>
                <div className="h-2 overflow-hidden rounded-full bg-line">
                  <div
                    className={`h-full ${verdict.verdict === "ok" ? "bg-ok" : "bg-accent"}`}
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
    ok: { label: "認めたる", cls: "border-ok/60 text-ok" },
    suspicious: { label: "怪しい", cls: "border-accent-soft/60 text-accent-soft" },
    ng: { label: "話にならん", cls: "border-accent/60 text-accent" },
  }[verdict];
  return (
    <span className={`rounded-full border px-4 py-1.5 text-sm font-black ${map.cls}`}>
      {map.label}
    </span>
  );
}

function toDataUrl(file: File): Promise<string> {
  return new window.Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
