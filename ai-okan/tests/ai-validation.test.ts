import assert from "node:assert/strict";
import test from "node:test";
import { validateOkanReply, validateProfile, validateVerdict } from "../lib/ai-validation";

const profile = {
  headline: "最初のひとこと", traits: [
    { label: "先延ばし", evidence: "2026年9月に予定を後回しにしたやん" },
    { label: "見積もり不足", evidence: "2回続けて時間を短く見積もったやん" },
    { label: "継続の壁", evidence: "3週間で記録が止まってるやん" },
  ],
  pattern: "始める前に準備を増やして、肝心の一歩を遅らせてるやん。",
  weakness: "忙しくなった時に予定を消すところや。",
  prediction: "このままやと同じ目標を来月も書くで。",
  okanLine: "今日の小さい一歩を決めなさい。",
};

test("accepts a bounded complete profile and rejects an incomplete or oversized one", () => {
  assert.deepEqual(validateProfile(profile), profile);
  assert.equal(validateProfile({ ...profile, traits: profile.traits.slice(0, 2) }), null);
  assert.equal(validateProfile({ ...profile, headline: "長".repeat(21) }), null);
});

test("rejects malformed verdicts instead of coercing them", () => {
  assert.deepEqual(validateVerdict({ verdict: "ok", whatISee: "運動靴が写っている", okan: "よう出したな。", score: 80 }),
    { verdict: "ok", whatISee: "運動靴が写っている", okan: "よう出したな。", score: 80 });
  assert.equal(validateVerdict({ verdict: "ok", whatISee: "写真", okan: "ええで", score: 101 }), null);
  assert.equal(validateVerdict({ verdict: "maybe", whatISee: "写真", okan: "ええで", score: 80 }), null);
  assert.equal(validateOkanReply({ okan: "長".repeat(121) }), null);
});
