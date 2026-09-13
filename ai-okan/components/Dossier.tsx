"use client";

import type { Profile, Engine } from "@/lib/types";
import { Button, EngineBadge, OkanBubble } from "./ui";

export function Dossier({
  profile,
  engine,
  onNext,
}: {
  profile: Profile;
  engine: Engine | null;
  onNext: () => void;
}) {
  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="bg-accent px-3 py-1 text-xs font-bold text-white">おかんが気づいたこと</span>
          <EngineBadge engine={engine} />
        </div>
        <p className="text-muted">
          渡してもらった履歴を読み込んで、
          <span className="font-bold text-fg">繰り返し出ている行動</span>を抜き出しました。
        </p>
      </header>

      {/* 何をした結果なのかを、おかん本人の口から言わせる */}
      <OkanBubble text="あんたが今まで書いてきたもん、ぜんぶ読ませてもろたで。ほんで分かったことがある。あんた、同じことを何回も繰り返してるわ。" />

      <p className="text-3xl font-bold leading-tight sm:text-4xl">「{profile.headline}」</p>

      <section className="space-y-4">
        <h2 className="border-l-8 border-accent pl-4 text-xl font-bold">出てきた癖は3つ</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {profile.traits.map((t, i) => (
            <div
              key={t.label}
              className="rise rounded-xl border border-line bg-bg p-5"
              style={{ animationDelay: `${i * 120}ms` }}
            >
              <p className="border-b-2 border-accent pb-2 text-lg font-bold text-accent">{t.label}</p>
              <p className="mt-3 text-sm text-muted">{t.evidence}</p>
            </div>
          ))}
        </div>
      </section>

      <dl className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
        {[
          { k: "繰り返しているパターン", v: profile.pattern },
          { k: "どこで折れるか", v: profile.weakness },
          { k: "このままだと", v: profile.prediction },
        ].map((row) => (
          <div key={row.k} className="bg-bg p-5">
            <dt className="bg-bg-soft px-2 py-1 text-xs font-bold text-muted">{row.k}</dt>
            <dd className="mt-3 text-[15px]">{row.v}</dd>
          </div>
        ))}
      </dl>

      <p className="border-l-8 border-danger bg-bg-soft px-5 py-4 text-xl font-bold leading-snug sm:text-2xl">
        {profile.okanLine}
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={onNext}>おかんと約束する</Button>
        <span className="text-sm text-muted">言い当てられた今のうちに、次へ進みます。</span>
      </div>
    </div>
  );
}
