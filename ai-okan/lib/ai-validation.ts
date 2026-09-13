import type { Profile, Verdict } from "./types";

export type OkanReply = { okan: string };

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maximum ? normalized : null;
}

/** Accept only the bounded profile shape the UI is able to render safely. */
export function validateProfile(value: unknown): Profile | null {
  const candidate = record(value);
  if (!candidate || !Array.isArray(candidate.traits) || candidate.traits.length !== 3) return null;

  const traits = candidate.traits.map((trait) => {
    const item = record(trait);
    if (!item) return null;
    const label = text(item.label, 15);
    const evidence = text(item.evidence, 60);
    return label && evidence ? { label, evidence } : null;
  });
  if (traits.some((trait) => trait === null)) return null;

  const headline = text(candidate.headline, 20);
  const pattern = text(candidate.pattern, 80);
  const weakness = text(candidate.weakness, 60);
  const prediction = text(candidate.prediction, 60);
  const okanLine = text(candidate.okanLine, 40);
  if (!headline || !pattern || !weakness || !prediction || !okanLine) return null;

  return { headline, traits: traits as Profile["traits"], pattern, weakness, prediction, okanLine };
}

/** Reject instead of coercing an AI verdict so invalid output always reaches an explicit fallback. */
export function validateVerdict(value: unknown): Verdict | null {
  const candidate = record(value);
  if (!candidate) return null;
  const verdict = candidate.verdict;
  const whatISee = text(candidate.whatISee, 60);
  const okan = text(candidate.okan, 120);
  const score = candidate.score;
  if ((verdict !== "ok" && verdict !== "ng" && verdict !== "suspicious") || !whatISee || !okan
    || typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 100) return null;
  return { verdict, whatISee, okan, score };
}

export function validateOkanReply(value: unknown, maximum = 120): OkanReply | null {
  const candidate = record(value);
  const okan = candidate && text(candidate.okan, maximum);
  return okan ? { okan } : null;
}
