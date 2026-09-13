"use client";

import { useRef, useState } from "react";
import type { Promise as Contract, Verdict, Engine } from "@/lib/types";
import { Button, EngineBadge, Heading, OkanBubble } from "./ui";

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
          もう一回、約束しなおす
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Heading lead="証拠を出すまで、おかんは信じひん。">監視</Heading>

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
              <img src={preview} alt="提出した証拠" className="size-full object-cover" />
            ) : (
              <div className="space-y-2 px-6">
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
            <Button variant="secondary" onClick={timeUp} disabled={busy !== null}>
              {busy === "scold" ? "…" : "期限が来てもうた"}
            </Button>
          </div>
        </div>

        <div className="min-h-56">
          {busy === "judge" && (
            <p aria-live="polite" className="text-muted">おかんが写真を確認しとる…</p>
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

function toDataUrl(file: File): Promise<string> {
  return new window.Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
