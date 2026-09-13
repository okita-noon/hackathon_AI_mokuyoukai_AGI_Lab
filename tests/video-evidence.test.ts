/**
 * 動画証跡が「本当に Gemini に届く形」で組み立てられるかを、ネットワークなしで確かめる。
 * ここが壊れると、AIが見ていない動画で未達判定＝課金に向かうため、CI で守る価値が高い。
 */
import assert from "node:assert/strict";
import test from "node:test";

// env はモジュール読み込み時に固定されるため、import より前に決める
process.env.USE_VERTEX = "1";
process.env.GOOGLE_CLOUD_PROJECT = "test-project";

// env を書き換えてから読み込む必要があるので、トップレベルの静的 import は使わない
const aiMedia = () => import("../src/lib/ai/media");
const media = () => import("../src/lib/media");
const storage = () => import("../src/lib/storage");

test("短い動画は密に、長い動画は先頭だけをサンプリングする", async () => {
  const { MAX_ANALYZED_SECONDS, SHORT_VIDEO_FPS, DEFAULT_VIDEO_FPS, videoSampling } = await media();
  assert.deepEqual(videoSampling({ duration_sec: 30 }), {
    fps: SHORT_VIDEO_FPS,
    analyzedSeconds: 30,
    truncated: false,
  });
  assert.deepEqual(videoSampling({ duration_sec: 300 }), {
    fps: DEFAULT_VIDEO_FPS,
    analyzedSeconds: 300,
    truncated: false,
  });
  const long = videoSampling({ duration_sec: MAX_ANALYZED_SECONDS + 120 });
  assert.equal(long.truncated, true);
  assert.equal(long.analyzedSeconds, MAX_ANALYZED_SECONDS);
  // 尺が取れなかった端末でも判定は続行できる
  assert.deepEqual(videoSampling(null), { fps: DEFAULT_VIDEO_FPS, analyzedSeconds: null, truncated: false });
});

test("Vertex AI では gs:// をダウンロードせずそのまま渡す", async () => {
  const { resolveMediaParts } = await aiMedia();
  const { SHORT_VIDEO_FPS } = await media();
  const parts = await resolveMediaParts({
    mimeType: "video/mp4",
    storageUri: "gs://bucket/proofs/abc/def.mp4",
    meta: { duration_sec: 20, size_bytes: 12_000_000 },
  });
  assert.equal(parts.length, 1);
  assert.deepEqual(parts[0].fileData, { fileUri: "gs://bucket/proofs/abc/def.mp4", mimeType: "video/mp4" });
  assert.equal(parts[0].videoMetadata?.fps, SHORT_VIDEO_FPS);
  assert.equal(parts[0].videoMetadata?.endOffset, undefined);
});

test("長い動画には解析範囲の上限が付く", async () => {
  const { resolveMediaParts } = await aiMedia();
  const { MAX_ANALYZED_SECONDS, DEFAULT_VIDEO_FPS } = await media();
  const parts = await resolveMediaParts({
    mimeType: "video/quicktime",
    storageUri: "gs://bucket/proofs/abc/long.mov",
    meta: { duration_sec: MAX_ANALYZED_SECONDS * 2 },
  });
  assert.equal(parts[0].videoMetadata?.endOffset, `${MAX_ANALYZED_SECONDS}s`);
  assert.equal(parts[0].videoMetadata?.fps, DEFAULT_VIDEO_FPS);
});

test("画像は videoMetadata を付けずに inlineData で渡す", async () => {
  const { resolveMediaParts } = await aiMedia();
  const parts = await resolveMediaParts({ mimeType: "image/jpeg", bytes: Buffer.from("fake-image") });
  assert.equal(parts[0].inlineData?.mimeType, "image/jpeg");
  assert.equal(parts[0].videoMetadata, undefined);
});

test("中身を取り出せない証跡は、証拠なしで判定させず例外にする", async () => {
  const { resolveMediaParts } = await aiMedia();
  await assert.rejects(
    () => resolveMediaParts({ mimeType: "video/mp4", bytes: Buffer.alloc(0) }),
    /読み込めませんでした/,
  );
});

test("ファイルが無ければ part は空（位置情報だけの提出）", async () => {
  const { resolveMediaParts } = await aiMedia();
  assert.deepEqual(await resolveMediaParts(null), []);
});

test("端末ごとに異なる動画の MIME を受け付ける", async () => {
  const { ACCEPTED_MIME } = await storage();
  for (const mime of ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska", "video/3gpp"]) {
    assert.ok(ACCEPTED_MIME.has(mime), `${mime} が未対応`);
  }
});
