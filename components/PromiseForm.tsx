"use client";

import { useState } from "react";
import type { Promise as Contract, Engine } from "@/lib/types";
import { Button, EngineBadge, Heading, OkanBubble } from "./ui";

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
      <Heading>約束</Heading>
      <p className="text-muted">
        叱られるんやない。<span className="font-bold text-fg">自分で決めて、自分で縛る。</span>
        罰金の額を決めるのはあんたです。
      </p>

      <div className="space-y-8 rounded-xl border border-line bg-white p-6 sm:p-8">
        <Field label="何をやる">
          <input
            value={goal}
            disabled={locked}
            onChange={(e) => setGoal(e.target.value)}
            className="w-full rounded-xl border-2 border-line-strong bg-white px-4 py-3 text-lg font-bold disabled:bg-bg-soft disabled:opacity-70"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {GOAL_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                disabled={locked}
                onClick={() => setGoal(p)}
                className="rounded border border-line-strong bg-bg-soft px-3 py-1.5 text-xs font-bold text-muted hover:bg-white hover:text-accent disabled:opacity-40"
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
              className="w-full rounded-xl border-2 border-line-strong bg-white px-4 py-3 disabled:bg-bg-soft disabled:opacity-70"
            >
              {DEADLINES.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Field>
          <Field label="何を証拠に出す" hint="おかんがこの条件で写真を判定します。">
            <input
              value={evidence}
              disabled={locked}
              onChange={(e) => setEvidence(e.target.value)}
              className="w-full rounded-xl border-2 border-line-strong bg-white px-4 py-3 disabled:bg-bg-soft disabled:opacity-70"
            />
          </Field>
        </div>

        <Field label="守れへんかったら払う金額" hint="高いほど効きます。安すぎるとおかんに笑われます。">
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
            <span className="w-36 shrink-0 text-right text-3xl font-bold text-danger tabular-nums">
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
        <div className="rise space-y-5 border-l-8 border-accent bg-bg-soft p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="bg-accent px-3 py-1 text-xs font-bold text-white">約束が成立しました</span>
            <EngineBadge engine={engine} />
          </div>
          <OkanBubble text={reply} />
          <Button onClick={onNext}>監視をはじめる</Button>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-bold">{label}</p>
        <span className="bg-danger px-2 py-0.5 text-xs font-bold text-white">必須</span>
      </div>
      {hint && <p className="text-sm text-muted">{hint}</p>}
      {children}
    </div>
  );
}
