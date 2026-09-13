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
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
}) {
  const base =
    "inline-flex min-h-12 items-center justify-center rounded-xl px-7 py-2.5 text-base font-bold transition disabled:cursor-not-allowed disabled:opacity-50";
  const style = {
    primary: "bg-accent text-white hover:bg-accent-soft",
    secondary: "border-2 border-accent bg-bg text-accent hover:bg-bg-soft",
    danger: "bg-danger text-white hover:bg-accent-soft",
  }[variant];
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
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
        live ? "border-ok bg-bg text-ok" : "border-line bg-bg-soft text-muted"
      }`}
    >
      <span className={`size-2 rounded-full ${live ? "bg-ok" : "bg-muted"}`} />
      {live ? `${engine.toUpperCase()} で生成` : "デモモード（固定応答）"}
    </span>
  );
}

export function StepDots({ step }: { step: number }) {
  const labels = ["過去", "見立て", "約束", "監視"];
  return (
    <ol className="flex items-center gap-1.5 text-xs font-bold">
      {labels.map((l, i) => {
        const n = i + 1;
        const state = n === step ? "current" : n < step ? "done" : "todo";
        return (
          <li
            key={l}
            aria-current={state === "current" ? "step" : undefined}
            className={`rounded-full border px-3 py-1 ${
              state === "current"
                ? "border-accent bg-accent text-white"
                : state === "done"
                  ? "border-line bg-bg-soft text-muted"
                  : "border-line bg-bg text-muted/50"
            }`}
          >
            {n}. {l}
          </li>
        );
      })}
    </ol>
  );
}

/** public/okan.(png|jpg|webp) を置くとおかんの顔になる。無ければ文字にフォールバック */
const OKAN_IMAGE_CANDIDATES = ["/okan.png", "/okan.jpg", "/okan.webp"];

export function OkanFace({ tone = "normal", size = 56 }: { tone?: "normal" | "angry"; size?: number }) {
  const [index, setIndex] = useState(0);
  const src = OKAN_IMAGE_CANDIDATES[index];
  return (
    <div
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full border-2 bg-white ${
        tone === "angry" ? "border-danger" : "border-line-strong"
      }`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {src ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          className="size-full object-cover"
          onError={() => setIndex((i) => i + 1)}
        />
      ) : (
        <span
          className={`font-bold ${tone === "angry" ? "text-danger" : "text-muted"}`}
          style={{ fontSize: size * 0.26 }}
        >
          おかん
        </span>
      )}
    </div>
  );
}

export function OkanBubble({ text, tone = "normal" }: { text: string; tone?: "normal" | "angry" }) {
  return (
    <div className="flex items-start gap-4">
      <OkanFace tone={tone} />
      <div
        className={`relative rounded-2xl rounded-tl-md border-2 bg-bg px-5 py-4 text-[17px] ${
          tone === "angry" ? "border-danger" : "border-line-strong"
        }`}
      >
        {text}
      </div>
    </div>
  );
}

/** 見出し。DADSの見出しに倣って左に色罫を置く */
export function Heading({ children, lead }: { children: React.ReactNode; lead?: string }) {
  return (
    <div className="space-y-2">
      <h2 className="border-l-8 border-accent pl-4 text-2xl font-bold sm:text-3xl">{children}</h2>
      {lead && <p className="text-muted">{lead}</p>}
    </div>
  );
}
