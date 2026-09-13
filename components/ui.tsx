"use client";

import { useState } from "react";

import type { Engine } from "@/lib/types";

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost";
  type?: "button" | "submit";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-base font-bold transition disabled:opacity-40 disabled:cursor-not-allowed";
  const style =
    variant === "primary"
      ? "bg-accent text-white hover:brightness-110 shadow-[0_10px_30px_-10px_rgba(228,71,46,0.9)]"
      : "border border-line text-muted hover:text-fg hover:border-muted";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${style}`}>
      {children}
    </button>
  );
}

/** 本物のAIが答えたのか、フェイルセーフの固定応答なのかを常に開示する */
export function EngineBadge({ engine }: { engine: Engine | null }) {
  if (!engine) return null;
  const live = engine !== "demo";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold tracking-wide ${
        live ? "border-ok/50 text-ok" : "border-line text-muted"
      }`}
    >
      <span className={`size-1.5 rounded-full ${live ? "bg-ok" : "bg-muted"}`} />
      {live ? `${engine.toUpperCase()} で生成` : "デモモード（固定応答）"}
    </span>
  );
}

export function StepDots({ step }: { step: number }) {
  const labels = ["過去", "見立て", "約束", "監視"];
  return (
    <div className="flex items-center gap-2">
      {labels.map((l, i) => (
        <div key={l} className="flex items-center gap-2">
          <span
            className={`text-[11px] font-bold tracking-widest ${
              i + 1 === step ? "text-accent" : i + 1 < step ? "text-muted" : "text-line"
            }`}
          >
            {l}
          </span>
          {i < labels.length - 1 && <span className="h-px w-5 bg-line" />}
        </div>
      ))}
    </div>
  );
}

export function OkanFace({ tone = "normal", size = 56 }: { tone?: "normal" | "angry"; size?: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <div
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full ${
        tone === "angry" ? "bg-accent" : "bg-accent-soft/90"
      }`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {broken ? (
        <span style={{ fontSize: size * 0.45 }}>{tone === "angry" ? "\u{1F4A2}" : "\u{1F475}"}</span>
      ) : (
        // 差し替え用: public/okan.png を置くとおかんの顔になる。無ければ絵文字にフォールバック
        <img
          src="/okan.png"
          alt=""
          width={size}
          height={size}
          className="size-full object-cover"
          onError={() => setBroken(true)}
        />
      )}
    </div>
  );
}

export function OkanBubble({ text, tone = "normal" }: { text: string; tone?: "normal" | "angry" }) {
  return (
    <div className="flex items-start gap-4">
      <OkanFace tone={tone} />
      <div className="relative rounded-2xl rounded-tl-sm border border-line bg-bg-soft px-5 py-4 text-[17px] leading-relaxed">
        {text}
      </div>
    </div>
  );
}
