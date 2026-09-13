"use client";

import { useEffect, useState } from "react";
import { Button, Heading, OkanBubble } from "./ui";
import type { PastSelf } from "@/lib/types";

const KIND: Record<string, string> = {
  profile: "経歴",
  sns: "SNS発信",
  works: "書籍・仕事",
};

export function Ingest({
  onDone,
  busy,
}: {
  onDone: (extra: string) => void;
  busy: boolean;
}) {
  const [extra, setExtra] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [data, setData] = useState<PastSelf | null>(null);

  // 元データはバックエンドが持っている。画面は受け取って並べるだけ
  useEffect(() => {
    fetch("/api/sources")
      .then((r) => r.json())
      .then((json) => setData(json))
      .catch(() => setData(null));
  }, []);

  const total = data?.sources.reduce((a, s) => a + s.items.length, 0) ?? 0;

  useEffect(() => {
    if (!busy || !data) return;
    const lines = [
      ...data.sources.map((s) => `${s.label} を読み込み中… ${s.items.length}件`),
      "時系列を突き合わせ中…",
      "繰り返している主張を数え中…",
      "AIおかんが目を通しています…",
    ];
    let i = 0;
    const t = setInterval(() => {
      setLog((prev) => (i < lines.length ? [...prev, lines[i++]] : prev));
    }, 700);
    return () => clearInterval(t);
  }, [busy, data]);

  return (
    <div className="space-y-8">
      <Heading>おかんに自分を知ってもらう</Heading>

      <OkanBubble text="あんたのこと、まだ何も知らんからな。今まで何を言うてきたんか、見せてみ。格好つけても、どうせすぐ分かるで。" />

      <div className="rounded-xl border border-line bg-bg-soft p-5">
        <p className="font-bold">見せた内容は、次の画面での見立てに使われます</p>
        <p className="mt-2 text-sm text-muted">
          おかんは{total || "—"}件の発信を時系列で突き合わせ、
          <span className="font-bold text-fg">あなたが何を繰り返しているのか</span>を割り出します。
          見せる量が多いほど、指摘は具体的になります。
        </p>
        {data?.note && <p className="mt-2 text-xs text-muted">{data.note}</p>}
      </div>

      {data === null ? (
        <p className="text-muted">読み込み中…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {data.sources.map((s) => (
            <div key={s.id} className="rounded-xl border border-line bg-bg p-5">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <span className="bg-bg-soft px-2 py-0.5 text-xs font-bold text-muted">
                  {KIND[s.id] ?? s.label}
                </span>
                <span className="text-sm font-bold tabular-nums">{s.items.length}件</span>
              </div>
              <p className="mt-3 text-lg font-bold">{s.label}</p>
              <p className="text-xs text-muted">{s.note}</p>
              <ul className="mt-3 space-y-1 text-[11px] leading-snug text-muted">
                {s.items.slice(0, 2).map((i, index) => (
                  <li key={index} className="truncate">
                    {i.date ? `${i.date} ` : ""}
                    {i.text}
                  </li>
                ))}
                <li className="text-muted/70">…ほか{s.items.length - 2}件</li>
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="extra" className="block text-sm font-bold">
          おかんに言うておきたいことがあれば
          <span className="ml-2 bg-bg-soft px-2 py-0.5 text-xs font-normal text-muted">任意</span>
        </label>
        <textarea
          id="extra"
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          rows={2}
          placeholder="例：最近まとまった時間が取れない"
          className="w-full rounded-xl border-2 border-line-strong bg-bg px-4 py-3 text-fg placeholder:text-muted/60"
        />
      </div>

      {busy ? (
        <div
          aria-live="polite"
          className="rounded-xl border border-line bg-bg-soft p-5 font-mono text-sm text-muted"
        >
          {log.map((l) => (
            <p key={l} className="rise">
              ▸ {l}
            </p>
          ))}
          <p className="text-accent">…</p>
        </div>
      ) : (
        <Button
          onClick={() => {
            setLog([]);
            onDone(extra);
          }}
          disabled={!data}
        >
          これでおかんに見てもらう
        </Button>
      )}
    </div>
  );
}
