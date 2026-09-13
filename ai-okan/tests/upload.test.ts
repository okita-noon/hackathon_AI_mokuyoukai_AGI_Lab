import assert from "node:assert/strict";
import test from "node:test";
import { uploadError } from "../lib/upload";

test("uploads reject empty, unsupported and oversized media before allocation", () => {
  assert.match(uploadError({ type: "image/svg+xml", size: 100 })!, /JPEG/);
  assert.match(uploadError({ type: "image/jpeg", size: 0 })!, /空/);
  assert.match(uploadError({ type: "image/jpeg", size: 8 * 1024 * 1024 + 1 })!, /8MB/);
  assert.match(uploadError({ type: "video/mp4", size: 32 * 1024 * 1024 + 1 })!, /32MB/);
  assert.equal(uploadError({ type: "image/png", size: 8 * 1024 * 1024 }), null);
  assert.equal(uploadError({ type: "video/quicktime", size: 32 * 1024 * 1024 }), null);
});
