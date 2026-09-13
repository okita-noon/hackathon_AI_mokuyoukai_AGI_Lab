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
    <div className="space-y-10">
      {/* 読ませるのではなく、顔と一言で伝える */}
      <section className="relative overflow-hidden rounded-3xl border-2 border-line bg-bg-soft px-6 pb-12 pt-32 text-center sm:px-10 sm:pb-16 sm:pt-36">
        <Noren />

        <div className="relative mx-auto flex max-w-xl flex-col items-center gap-6">
          <OkanFace size={152} />

          <p className="relative rounded-3xl rounded-tl-lg border-2 border-line-strong bg-bg px-6 py-5 text-xl font-bold leading-snug text-balance sm:px-7 sm:text-3xl">
            あんた、また来たんか。
            <br />
            まあ座り。
          </p>

          <h1 className="text-2xl font-bold leading-snug text-balance sm:text-4xl">
            あんたの目標、
            <br className="sm:hidden" />
            <span className="text-accent">おかんが見たるわ。</span>
          </h1>

          <Button onClick={() => router.push("/ingest")}>おかんに自分を知ってもらう</Button>
          <EngineBadge engine={engine} />
        </div>
      </section>

      {/* 手順は読ませない。単語と番号だけ置く */}
      <ol className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
        {["知ってもらう", "見立て", "約束", "監視"].map((t, i) => (
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
