import assert from "node:assert/strict";
import test from "node:test";
import { deadlineAt, validateContract } from "../lib/backend/contract";

test("validates and normalizes a promise", () => {
  assert.deepEqual(validateContract({
    id: "123e4567-e89b-12d3-a456-426614174000",
    goal: "  ジムへ行く ", deadline: "3日以内", evidence: " 写真 ", penalty: 3000.9,
  }), {
    id: "123e4567-e89b-12d3-a456-426614174000",
    goal: "ジムへ行く", deadline: "3日以内", deadlineAt: undefined, evidence: "写真", penalty: 3000,
  });
});

test("rejects invalid promises", () => {
  assert.equal(validateContract({ goal: "", deadline: "3日以内", evidence: "写真", penalty: 3000 }), null);
  assert.equal(validateContract({ goal: "ジム", deadline: "3日以内", evidence: "写真", penalty: 99 }), null);
});

test("converts relative deadlines and Tokyo end of day", () => {
  const now = new Date("2026-09-13T03:00:00.000Z");
  assert.equal(deadlineAt("3日以内", now).toISOString(), "2026-09-16T03:00:00.000Z");
  assert.equal(deadlineAt("1週間以内", now).toISOString(), "2026-09-20T03:00:00.000Z");
  assert.equal(deadlineAt("今日の23:59まで", now).toISOString(), "2026-09-13T14:59:00.000Z");
});
