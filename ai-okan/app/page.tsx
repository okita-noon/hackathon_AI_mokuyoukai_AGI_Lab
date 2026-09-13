"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Engine } from "@/lib/types";
import { Button, EngineBadge } from "@/components/ui";

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
    <div className="space-y-10">
      {/* 読ませるのではなく、おかんが目の前におる絵で伝える */}
      <section className="relative overflow-hidden rounded-3xl border-2 border-line bg-bg-soft pt-24 sm:pt-28">
        <Noren />

        <div className="relative sm:grid sm:grid-cols-[1fr_minmax(0,420px)] sm:items-end">
          {/* おかん本体。顔以外は文字とかぶってよい */}
          <img
            src="/okan-full.webp"
            alt="AIおかん"
            className="pointer-events-none relative z-0 mx-auto -mt-8 -mb-10 block w-[320px] max-w-full sm:order-2 sm:mx-0 sm:-mb-8 sm:-ml-16 sm:-mt-20 sm:w-full"
          />

          <div className="relative z-10 space-y-5 px-6 pb-10 sm:order-1 sm:px-10 sm:pb-14">
            <p className="inline-block rounded-3xl rounded-bl-lg border-2 border-line-strong bg-bg px-6 py-4 text-xl font-bold leading-snug text-balance shadow-[6px_6px_0_rgba(0,0,0,0.06)] sm:px-7 sm:text-2xl">
              あんた、また来たんか。
              <br />
              まあ座り。
            </p>

            <h1 className="text-2xl font-bold leading-snug text-balance sm:text-4xl">
              あんたの目標、
              <br />
              <span className="text-accent">おかんが見たるわ。</span>
            </h1>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => router.push("/ingest")}>おかんに自分を知ってもらう</Button>
              <EngineBadge engine={engine} />
            </div>
          </div>
        </div>
      </section>

      {/* 手順は読ませない。単語と番号だけ置く */}
      <ol className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
        {["知ってもらう", "気づき", "約束", "監視"].map((t, i) => (
          <li key={t} className="flex items-center gap-2 sm:gap-3">
            <span className="flex items-center gap-2 rounded-full border border-line bg-bg px-4 py-2">
              <span className="grid size-6 place-items-center rounded-full bg-accent text-xs font-bold text-white">
                {i + 1}
              </span>
              <span className="font-bold">{t}</span>
            </span>
            {i < 3 && <span className="text-line-strong">→</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** 入口ののれん。読ませる文字ではなく、店先に入る感覚を出すための飾り */
function Noren() {
  const panels = ["", "お", "か", "ん", ""];
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0" aria-hidden>
      {/* のれんを吊る竿 */}
      <div className="h-2 w-full bg-line-strong" />
      <div className="flex h-20 w-full gap-[3px] sm:h-24">
        {panels.map((ch, i) => (
          <div
            key={i}
            className="grid flex-1 place-items-center rounded-b-lg bg-accent pb-2 text-3xl font-bold text-white sm:text-4xl"
          >
            {ch}
          </div>
        ))}
      </div>
    </div>
  );
}
