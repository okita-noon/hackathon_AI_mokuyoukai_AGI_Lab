"use client";

import { useEffect, useState } from "react";
import pastSelf from "@/data/past-self.json";
import { Button, Heading, OkanBubble } from "./ui";

const KIND: Record<string, string> = { gmail: "メール", x: "SNS投稿", line: "メッセージ" };

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
      "AIおかんが目を通しています…",
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
      <Heading>おかんに自分を知ってもらう</Heading>

      <OkanBubble text="あんたのこと、まだ何も知らんからな。普段どんなこと言うてるんか、見せてみ。格好つけても、どうせすぐ分かるで。" />

      <div className="rounded-xl border border-line bg-bg-soft p-5">
        <p className="font-bold">見せた履歴は、次の画面での見立てに使われます</p>
        <p className="mt-2 text-sm text-muted">
          おかんは{total}件の履歴を時系列で突き合わせ、宣言と実績のズレから
          <span className="font-bold text-fg">あなたが毎回どこで折れるのか</span>を割り出します。
          ここで見せる量が多いほど、指摘は具体的になります。
        </p>
        <p className="mt-2 text-sm text-muted">
          Gmailのエクスポート、Xのアーカイブ、LINEのトーク履歴——
          <span className="font-bold text-fg">いずれも実際にエクスポートできる形式</span>です。
          渡した履歴はこの端末のブラウザにだけ残り、サーバーには送られません。
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {pastSelf.sources.map((s) => (
          <div key={s.id} className="rounded-xl border border-line bg-white p-5">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <span className="bg-bg-soft px-2 py-0.5 text-xs font-bold text-muted">
                {KIND[s.id]}
              </span>
              <span className="text-sm font-bold tabular-nums">{s.items.length}件</span>
            </div>
            <p className="mt-3 text-lg font-bold">{s.label}</p>
            <p className="text-xs text-muted">{s.note}</p>
            <ul className="mt-3 space-y-1 text-[11px] leading-snug text-muted">
              {s.items.slice(0, 2).map((i) => (
                <li key={i.date} className="truncate">
                  {i.date} {i.text}
                </li>
              ))}
              <li className="text-muted/70">…ほか{s.items.length - 2}件</li>
            </ul>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <label htmlFor="extra" className="block text-sm font-bold">
          おかんに言うておきたいことがあれば<span className="ml-2 bg-bg-soft px-2 py-0.5 text-xs font-normal text-muted">任意</span>
        </label>
        <textarea
          id="extra"
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          rows={2}
          placeholder="例：最近まとまった時間が取れない"
          className="w-full rounded-xl border-2 border-line-strong bg-white px-4 py-3 text-fg placeholder:text-muted/60"
        />
      </div>

      {busy ? (
        <div aria-live="polite" className="rounded-xl border border-line bg-bg-soft p-5 font-mono text-sm text-muted">
          {log.map((l) => (
            <p key={l} className="rise">
              ▸ {l}
            </p>
          ))}
          <p className="text-accent">…</p>
        </div>
      ) : (
        <Button onClick={() => onDone(extra)}>これでおかんに見てもらう</Button>
      )}
    </div>
  );
}
