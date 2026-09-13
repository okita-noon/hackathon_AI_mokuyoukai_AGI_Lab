import type { Promise as Contract } from "./types";

/**
 * 画面間の受け渡しはURLの引数で行う。
 * サーバーやDBが無くても次の画面に必要なものが揃うようにするため。
 */
export function contractToParams(contract: Contract): string {
  const params = new URLSearchParams({
    goal: contract.goal,
    deadline: contract.deadline,
    evidence: contract.evidence,
    penalty: String(contract.penalty),
  });
  if (contract.id) params.set("id", contract.id);
  if (contract.deadlineAt) params.set("at", contract.deadlineAt);
  return params.toString();
}

export function contractFromParams(params: URLSearchParams): Contract | null {
  const goal = params.get("goal")?.trim();
  const deadline = params.get("deadline")?.trim();
  const evidence = params.get("evidence")?.trim();
  const penalty = Math.floor(Number(params.get("penalty")));
  if (!goal || !deadline || !evidence) return null;
  if (!Number.isFinite(penalty) || penalty <= 0) return null;
  return {
    goal,
    deadline,
    evidence,
    penalty,
    id: params.get("id") ?? undefined,
    deadlineAt: params.get("at") ?? undefined,
  };
}
