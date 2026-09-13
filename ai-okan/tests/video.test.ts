/**
 * 動画エビデンス（腕立て伏せの回数判定）のルールをネットワークなしで確かめる。
 * ここが崩れると「10回やったのに ng」「8回やのに ok」が起きる。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { analyzedSeconds, requiredCount, samplingFps, MAX_ANALYZED_SECONDS } from "../lib/media-rules";
import { normalizeVerdict } from "../lib/verdict";

test("約束の文面から必要な回数を読む", () => {
  assert.equal(requiredCount("腕立て伏せを10回やる"), 10);
  assert.equal(requiredCount("腕立て伏せ１０回"), 10); // 全角
  assert.equal(requiredCount("30 回 スクワット"), 30);
  assert.equal(requiredCount("ジムに行く"), null);
});

test("短い動画ほど細かくサンプリングする（回数を数えるため）", () => {
  // 実機の腕立て動画で 4コマ/秒は 6〜10回とぶれ、10コマ/秒で 10回に安定した
  assert.equal(samplingFps(11), 10); // 十数秒の腕立て動画
  assert.equal(samplingFps(20), 10);
  assert.equal(samplingFps(45), 4);
  assert.equal(samplingFps(300), 1);
  assert.equal(samplingFps(null), 4); // 尺不明でも数えられる程度には密に
});

test("長い動画は先頭だけを解析する", () => {
  assert.deepEqual(analyzedSeconds(15), { seconds: 15, truncated: false });
  assert.deepEqual(analyzedSeconds(MAX_ANALYZED_SECONDS + 60), { seconds: MAX_ANALYZED_SECONDS, truncated: true });
  assert.deepEqual(analyzedSeconds(null), { seconds: null, truncated: false });
});

test("回数が足りないのに ok と言われたら、アプリ側で ng に倒す", () => {
  const v = normalizeVerdict(
    { verdict: "ok", whatISee: "腕立て伏せをしている", okan: "ようやった", score: 90, counted: 8 },
    10,
  );
  assert.equal(v.verdict, "ng");
  assert.equal(v.counted, 8);
  assert.equal(v.required, 10);
  assert.ok(v.score <= 30);
  assert.match(v.okan, /8回/);
});

test("約束の回数に届いていれば ok のまま", () => {
  const v = normalizeVerdict(
    { verdict: "ok", whatISee: "10回完了", okan: "えらい", score: 88, counted: 10 },
    10,
  );
  assert.equal(v.verdict, "ok");
  assert.equal(v.counted, 10);
});

test("数えられなかった動画は ok に昇格させない", () => {
  const v = normalizeVerdict({ verdict: "suspicious", okan: "怪しい", whatISee: "途中で切れている", score: 20 }, 10);
  assert.equal(v.verdict, "suspicious");
  assert.equal(v.counted, null);
  assert.equal(v.required, 10);
});

test("壊れた出力は suspicious に落とす", () => {
  const v = normalizeVerdict(null, null);
  assert.equal(v.verdict, "suspicious");
  assert.equal(v.score, 0);
});
