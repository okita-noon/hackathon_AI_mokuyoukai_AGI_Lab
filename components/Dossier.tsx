"use client";

import type { Profile, Engine } from "@/lib/types";
import { Button, EngineBadge, OkanFace } from "./ui";

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
          <span className="rounded-full bg-accent/15 px-3 py-1 text-[11px] font-bold tracking-widest text-accent">
            おかんの見立て
          </span>
          <EngineBadge engine={engine} />
        </div>
        <div className="flex items-center gap-5">
          <OkanFace size={72} />
          <h2 className="slam text-4xl font-black leading-tight sm:text-5xl">
            「{profile.headline}」
          </h2>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {profile.traits.map((t, i) => (
          <div
            key={t.label}
            className="rise rounded-2xl border border-line bg-bg-soft p-5"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            <p className="text-lg font-black text-accent-soft">{t.label}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t.evidence}</p>
          </div>
        ))}
      </div>

      <dl className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
        {[
          { k: "繰り返しとるパターン", v: profile.pattern },
          { k: "どこで折れるか", v: profile.weakness },
          { k: "このままやと", v: profile.prediction },
        ].map((row) => (
          <div key={row.k} className="bg-bg-soft p-5">
            <dt className="text-[11px] font-bold tracking-widest text-muted">{row.k}</dt>
            <dd className="mt-2 text-[15px] leading-relaxed">{row.v}</dd>
          </div>
        ))}
      </dl>

      <p className="border-l-2 border-accent py-2 pl-5 text-2xl font-black leading-snug sm:text-3xl">
        {profile.okanLine}
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={onNext}>ほな、約束する</Button>
        <span className="text-sm text-muted">言い当てられたうちに次いこか。</span>
      </div>
    </div>
  );
}
