"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Engine } from "@/lib/types";
import { Button, EngineBadge, OkanFace } from "@/components/ui";

export default function Home() {
  const router = useRouter();
  const [engine, setEngine] = useState<Engine | null>(null);

  useEffect(() => {
    fetch("/api/okan")
      .then((r) => r.json())
      .then((j) => setEngine(j.engine))
      .catch(() => setEngine("demo"));
  }, []);

  return (
    <div className="space-y-12">
      <section className="space-y-7">
        <div className="flex items-center gap-4">
          <OkanFace size={88} />
          <p className="rounded-2xl rounded-bl-md border-2 border-line-strong bg-bg px-5 py-3 text-lg font-bold">
            あんた、また来たんか。
          </p>
        </div>
        <h1 className="text-4xl font-bold leading-[1.25] sm:text-5xl">
          自分以上に
          <br />
          自分を知っているAIが、
          <br />
          <span className="text-accent">逃がしてくれない。</span>
        </h1>
        <p className="max-w-2xl text-lg text-muted">
          目標が続かないのは、意志が弱いからではありません。
          <span className="font-bold text-fg">誰も見ていないから</span>です。
          過去のデータをすべて読み込んだAIおかんが約束を結び、証拠を出すまで許しません。
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <Button onClick={() => router.push("/ingest")}>おかんに自分を知ってもらう</Button>
          <EngineBadge engine={engine} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="border-l-8 border-accent pl-4 text-xl font-bold">やることは4つだけ</h2>
        <ol className="grid gap-4 sm:grid-cols-4">
          {[
            { n: 1, t: "自分を知ってもらう", d: "Gmail・X・LINEの履歴をおかんに見せます" },
            { n: 2, t: "見立てを受ける", d: "AIが挫折のパターンを具体的に指摘します" },
            { n: 3, t: "約束を結ぶ", d: "期限・証拠・罰金を自分で決めて自分を縛ります" },
            { n: 4, t: "監視される", d: "提出した写真・動画をAIが判定します" },
          ].map((c) => (
            <li key={c.n} className="rounded-xl border border-line bg-bg p-5">
              <span className="grid size-8 place-items-center rounded-full bg-accent font-bold text-white">
                {c.n}
              </span>
              <p className="mt-3 font-bold">{c.t}</p>
              <p className="mt-1 text-sm text-muted">{c.d}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
