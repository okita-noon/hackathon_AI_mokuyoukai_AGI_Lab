"use client";

import { useState } from "react";
import type { Promise as Contract, Engine } from "@/lib/types";
import { Button, EngineBadge, OkanBubble } from "./ui";

const GOAL_PRESETS = ["今日ジムに行く", "22時までに帰って自炊する", "参考書を10ページ進める"];
const DEADLINES = ["今日の23:59まで", "3日以内", "1週間以内"];

export function PromiseForm({
  onSubmit,
  reply,
  engine,
  busy,
  onNext,
}: {
  onSubmit: (c: Contract) => void;
  reply: string | null;
  engine: Engine | null;
  busy: boolean;
  onNext: () => void;
}) {
  const [goal, setGoal] = useState(GOAL_PRESETS[0]);
  const [deadline, setDeadline] = useState(DEADLINES[0]);
  const [evidence, setEvidence] = useState("その場で撮った写真");
  const [penalty, setPenalty] = useState(3000);

  const locked = reply !== null;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h2 className="text-3xl font-black sm:text-4xl">約束</h2>
        <p className="text-muted">
          叱られるんやない。<span className="text-fg">自分で決めて、自分で縛る。</span>
          罰金の額を決めるのはあんたや。
        </p>
      </header>

      <div className="space-y-6 rounded-2xl border border-line bg-bg-soft p-6">
        <Field label="何をやる">
          <input
            value={goal}
            disabled={locked}
            onChange={(e) => setGoal(e.target.value)}
            className="w-full rounded-xl border border-line bg-bg px-4 py-3 text-lg font-bold outline-none focus:border-muted disabled:opacity-60"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {GOAL_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                disabled={locked}
                onClick={() => setGoal(p)}
                className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-fg disabled:opacity-40"
              >
                {p}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="いつまでに">
            <select
              value={deadline}
              disabled={locked}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full rounded-xl border border-line bg-bg px-4 py-3 outline-none focus:border-muted disabled:opacity-60"
            >
              {DEADLINES.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Field>
          <Field label="何を証拠に出す">
            <input
              value={evidence}
              disabled={locked}
              onChange={(e) => setEvidence(e.target.value)}
              className="w-full rounded-xl border border-line bg-bg px-4 py-3 outline-none focus:border-muted disabled:opacity-60"
            />
          </Field>
        </div>

        <Field label="守れへんかったら払う金額">
          <div className="flex items-center gap-5">
            <input
              type="range"
              min={500}
              max={30000}
              step={500}
              value={penalty}
              disabled={locked}
              onChange={(e) => setPenalty(Number(e.target.value))}
              className="h-1 w-full accent-[var(--accent)]"
            />
            <span className="w-32 shrink-0 text-right text-3xl font-black text-accent tabular-nums">
              ¥{penalty.toLocaleString()}
            </span>
          </div>
        </Field>
      </div>

      {!locked && (
        <Button
          disabled={busy || !goal.trim()}
          onClick={() => onSubmit({ goal, deadline, evidence, penalty })}
        >
          {busy ? "おかんが考えとる…" : "この条件で約束する"}
        </Button>
      )}

      {locked && (
        <div className="space-y-5 rise">
          <EngineBadge engine={engine} />
          <OkanBubble text={reply} />
          <Button onClick={onNext}>監視をはじめる</Button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold tracking-widest text-muted">{label}</p>
      {children}
    </div>
  );
}
