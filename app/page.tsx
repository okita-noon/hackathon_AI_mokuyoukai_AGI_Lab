"use client";

import { useEffect, useState } from "react";
import type { Profile, Promise as Contract, Engine } from "@/lib/types";
import { Button, EngineBadge, OkanFace, StepDots } from "@/components/ui";
import { Ingest } from "@/components/Ingest";
import { Dossier } from "@/components/Dossier";
import { PromiseForm } from "@/components/PromiseForm";
import { Watch } from "@/components/Watch";

const STORE_KEY = "ai-okan-state-v1";

type State = {
  step: number;
  profile: Profile | null;
  engine: Engine | null;
  contract: Contract | null;
  promiseReply: string | null;
  promiseEngine: Engine | null;
};

const INITIAL: State = {
  step: 0,
  profile: null,
  engine: null,
  contract: null,
  promiseReply: null,
  promiseEngine: null,
};

export default function Page() {
  const [s, setS] = useState<State>(INITIAL);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  // 状態はブラウザだけに置く。サーバーもDBも持たない
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved) setS(JSON.parse(saved));
    } catch {
      /* 壊れてたら初期状態で始める */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORE_KEY, JSON.stringify(s));
  }, [s, ready]);

  async function buildProfile(extra: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/okan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "profile", extra }),
      });
      const json = await res.json();
      setS((p) => ({ ...p, profile: json.profile, engine: json.engine, step: 2 }));
    } finally {
      setBusy(false);
    }
  }

  async function makePromise(contract: Contract) {
    setBusy(true);
    try {
      const res = await fetch("/api/okan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "promise", promise: contract }),
      });
      const json = await res.json();
      setS((p) => ({
        ...p,
        contract,
        promiseReply: json.okan,
        promiseEngine: json.engine,
      }));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setS(INITIAL);
  }

  if (!ready) return null;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10 sm:py-14">
      <div className="mb-10 flex flex-wrap items-center justify-between gap-4 border-b-4 border-accent pb-4">
        <button onClick={reset} className="text-left">
          <p className="text-xl font-bold">AIおかん</p>
          <p className="text-xs text-muted">あんたのこと、ぜんぶ知っとるで</p>
        </button>
        {s.step > 0 && <StepDots step={s.step} />}
      </div>

      {s.step === 0 && <Intro onStart={() => setS((p) => ({ ...p, step: 1 }))} />}
      {s.step === 1 && <Ingest busy={busy} onDone={buildProfile} />}
      {s.step === 2 && s.profile && (
        <Dossier
          profile={s.profile}
          engine={s.engine}
          onNext={() => setS((p) => ({ ...p, step: 3 }))}
        />
      )}
      {s.step === 3 && (
        <PromiseForm
          busy={busy}
          reply={s.promiseReply}
          engine={s.promiseEngine}
          onSubmit={makePromise}
          onNext={() => setS((p) => ({ ...p, step: 4 }))}
        />
      )}
      {s.step === 4 && s.contract && <Watch contract={s.contract} onReset={reset} />}

      <footer className="mt-16 border-t border-line pt-6 text-xs text-muted">
        <p>ハッカソン20260913 / AI木曜会 × AGI Lab</p>
        <p className="mt-1">
          入力した内容はこの端末のブラウザにだけ保存されます。サーバーには残りません。
        </p>
      </footer>
    </main>
  );
}

function Intro({ onStart }: { onStart: () => void }) {
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
          自分を知っとるAIが、
          <br />
          <span className="text-accent">逃がしてくれへん。</span>
        </h1>
        <p className="max-w-2xl text-lg text-muted">
          目標が続かへんのは、意志が弱いからやない。
          <span className="font-bold text-fg">誰も見てへんから</span>や。
          あんたの過去をぜんぶ読んだおかんが約束を結んで、証拠を出すまで許さん。
          <br />
          口はキツいけど、見放さへんで。
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <Button onClick={onStart}>あんたのこと、教えて</Button>
          <EngineBadge engine={engine} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="border-l-8 border-accent pl-4 text-xl font-bold">やることは4つだけ</h2>
        <ol className="grid gap-4 sm:grid-cols-4">
          {[
            { n: 1, t: "過去を渡す", d: "Gmail・X・LINEの履歴をそのまま投入する" },
            { n: 2, t: "見立てを食らう", d: "AIが挫折パターンを名指しで言い当てる" },
            { n: 3, t: "約束を結ぶ", d: "期限・証拠・罰金を自分で決めて自分を縛る" },
            { n: 4, t: "監視される", d: "写真をAIが判定。ごまかしは通らん" },
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
