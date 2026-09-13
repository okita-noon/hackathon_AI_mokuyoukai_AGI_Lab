"use client";

import { useEffect, useState } from "react";
import pastSelf from "@/data/past-self.json";
import { Button } from "./ui";

const ICONS: Record<string, string> = { gmail: "✉️", x: "𝕏", line: "💬" };

export function Ingest({
  onDone,
  busy,
}: {
  onDone: (extra: string) => void;
  busy: boolean;
}) {
  const [extra, setExtra] = useState("");
  const [log, setLog] = useState<string[]>([]);

  const total = pastSelf.sources.reduce((a, s) => a + s.items.length, 0);

  useEffect(() => {
    if (!busy) return;
    const lines = [
      ...pastSelf.sources.map((s) => `${s.label} を読み込み中… ${s.items.length}件`),
      "時系列を突き合わせ中…",
      "宣言と実績の差分を計算中…",
      "おかんが目を通してる…",
    ];
    setLog([]);
    let i = 0;
    const t = setInterval(() => {
      setLog((prev) => (i < lines.length ? [...prev, lines[i++]] : prev));
    }, 700);
    return () => clearInterval(t);
  }, [busy]);

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h2 className="text-3xl font-black sm:text-4xl">あんたのこと、教えて</h2>
        <p className="text-muted">
          過去{total}件の履歴をおかんに渡す。Gmailのエクスポート、Xのアーカイブ、LINEのトーク履歴——
          <span className="text-fg">どれも今日エクスポートできる、実在する形式</span>や。
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {pastSelf.sources.map((s) => (
          <div key={s.id} className="rounded-2xl border border-line bg-bg-soft p-5">
            <div className="flex items-center justify-between">
              <span className="text-2xl">{ICONS[s.id]}</span>
              <span className="text-xs text-muted">{s.note}</span>
            </div>
            <p className="mt-3 text-lg font-bold">{s.label}</p>
            <p className="text-sm text-muted">{s.items.length}件</p>
            <ul className="mt-3 space-y-1 text-[11px] leading-snug text-muted">
              {s.items.slice(0, 2).map((i) => (
                <li key={i.date} className="truncate">
                  {i.date} {i.text}
                </li>
              ))}
              <li className="text-line">…ほか{s.items.length - 2}件</li>
            </ul>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <label htmlFor="extra" className="text-sm font-bold text-muted">
          言うとくことある？（任意）
        </label>
        <textarea
          id="extra"
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          rows={2}
          placeholder="例：最近ほんまに時間がない"
          className="w-full rounded-xl border border-line bg-bg-soft px-4 py-3 text-fg outline-none placeholder:text-line focus:border-muted"
        />
      </div>

      {busy ? (
        <div className="rounded-2xl border border-line bg-bg-soft p-5 font-mono text-sm text-muted">
          {log.map((l) => (
            <p key={l} className="rise">
              ▸ {l}
            </p>
          ))}
          <p className="blink text-accent">…</p>
        </div>
      ) : (
        <Button onClick={() => onDone(extra)}>おかんに全部渡す</Button>
      )}
    </div>
  );
}
