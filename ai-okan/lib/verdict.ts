import type { Verdict } from "./types";

/**
 * モデルの出力をそのまま信じない。
 *
 * 回数が条件の約束で「8回しか数えられていないのに ok」が返ることは実際に起きる。
 * 罰金に直結する判断なので、数えた結果と結論の辻褄はアプリ側で合わせる。
 */
export function normalizeVerdict(value: Partial<Verdict> | null | undefined, required: number | null): Verdict {
  const verdict = ["ok", "ng", "suspicious"].includes(String(value?.verdict))
    ? (value!.verdict as Verdict["verdict"])
    : "suspicious";
  const rawCount = Number(value?.counted);
  const counted = Number.isFinite(rawCount) && rawCount >= 0 ? Math.round(rawCount) : null;

  const result: Verdict = {
    verdict,
    whatISee: String(value?.whatISee ?? "判定結果を確認できませんでした").slice(0, 300),
    okan: String(value?.okan ?? "もう一回、はっきり分かる証拠を出してな。").slice(0, 500),
    score: Math.min(100, Math.max(0, Math.round(Number(value?.score) || 0))),
    counted,
    required,
  };

  if (required !== null && counted !== null && counted < required && result.verdict === "ok") {
    return {
      ...result,
      verdict: "ng",
      score: Math.min(result.score, 30),
      okan: `${counted}回やろ。${required}回て約束したやんか。あと${required - counted}回、ちゃんとやってから出しといで。`,
    };
  }
  return result;
}
