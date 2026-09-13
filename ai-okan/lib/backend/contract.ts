import type { Promise as Contract } from "@/lib/types";

export function validateContract(value: unknown): Contract | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  const goal = typeof p.goal === "string" ? p.goal.trim() : "";
  const deadline = typeof p.deadline === "string" ? p.deadline.trim() : "";
  const evidence = typeof p.evidence === "string" ? p.evidence.trim() : "";
  const penalty = Math.floor(Number(p.penalty));
  if (!goal || goal.length > 200 || !deadline || deadline.length > 100 || !evidence || evidence.length > 1000) return null;
  if (!Number.isFinite(penalty) || penalty < 100 || penalty > 1_000_000) return null;
  const id = typeof p.id === "string" && /^[0-9a-f-]{36}$/i.test(p.id) ? p.id : undefined;
  const savedDeadline = typeof p.deadlineAt === "string" && !Number.isNaN(Date.parse(p.deadlineAt))
    ? p.deadlineAt
    : undefined;
  return { id, goal, deadline, deadlineAt: savedDeadline, evidence, penalty };
}

export function deadlineAt(label: string, now = new Date()): Date {
  if (label === "3日以内") return new Date(now.getTime() + 3 * 86_400_000);
  if (label === "1週間以内") return new Date(now.getTime() + 7 * 86_400_000);

  // 「今日」はアプリの利用地域（日本）の23:59として保存する。
  const inTokyo = new Date(now.getTime() + 9 * 3_600_000);
  let result = new Date(Date.UTC(
    inTokyo.getUTCFullYear(), inTokyo.getUTCMonth(), inTokyo.getUTCDate(), 14, 59, 0,
  ));
  if (result <= now) result = new Date(result.getTime() + 86_400_000);
  return result;
}
