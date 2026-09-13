import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import { currentUser } from "../lib/backend/db";
import { readJsonBody, RequestTooLargeError } from "../lib/backend/request";
import { anonymousSession, jsonWithSession, SESSION_COOKIE } from "../lib/backend/session";
import { persistVerifiedSubmission } from "../app/api/verify/route";
import { POST as checkoutPost } from "../app/api/penalty/checkout/route";
import { checkoutEnabled } from "../lib/backend/payment";

test("anonymous sessions receive separate HttpOnly cookies and preserve an existing session", () => {
  const first = anonymousSession(new Request("https://example.test/api/okan"));
  const second = anonymousSession(new Request("https://example.test/api/okan"));
  assert.notEqual(first.id, second.id);

  const response = jsonWithSession(first, { ok: true });
  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, new RegExp(`^${SESSION_COOKIE}=${first.id}`));
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Secure/i);
  assert.match(setCookie, /SameSite=lax/i);
  assert.equal(response.headers.get("cache-control"), "private, no-store");

  const resumed = anonymousSession(new Request("https://example.test/api/okan", {
    headers: { cookie: `${SESSION_COOKIE}=${first.id}` },
  }));
  assert.deepEqual(resumed, { id: first.id, isNew: false, secure: true });
  assert.equal(jsonWithSession(resumed, { ok: true }).headers.get("set-cookie"), null);
});

test("currentUser derives a different opaque database identity for each session", async () => {
  const emails: unknown[] = [];
  const client = {
    query: async (_sql: string, params: unknown[]) => {
      emails.push(params[0]);
      return { rows: [{ id: String(params[0]), ai_okan_state: {} }] };
    },
  } as unknown as PoolClient;

  const alice = await currentUser("1715acaf-50e7-46ed-915d-c721fee9b54d", client);
  const bob = await currentUser("6315eece-31a6-4cc7-a850-af5328db76d3", client);
  assert.notEqual(alice.id, bob.id);
  assert.notEqual(emails[0], emails[1]);
  assert.match(String(emails[0]), /^anon-[0-9a-f]{64}@ai-okan\.invalid$/);
  assert.doesNotMatch(String(emails[0]), /1715acaf/);
});

test("bounded JSON reader rejects declared and streamed oversized bodies", async () => {
  await assert.rejects(
    readJsonBody(new Request("https://example.test", {
      method: "POST",
      headers: { "content-length": "20" },
      body: "{}",
    }), 10),
    RequestTooLargeError,
  );
  await assert.rejects(
    readJsonBody(new Request("https://example.test", { method: "POST", body: JSON.stringify({ value: "123456" }) }), 10),
    RequestTooLargeError,
  );
  assert.deepEqual(
    await readJsonBody(new Request("https://example.test", { method: "POST", body: '{"ok":true}' }), 32),
    { ok: true },
  );
});

test("verify rechecks owner and terminal status under locks before writing", async () => {
  const queries: Array<{ sql: string; params: readonly unknown[] }> = [];
  const client = {
    query: async (sql: string, params: readonly unknown[]) => {
      queries.push({ sql, params });
      if (queries.length === 1) return { rows: [{ id: "alice" }], rowCount: 1 };
      if (queries.length === 2) return { rows: [{ status: "CANCELED" }], rowCount: 1 };
      throw new Error("terminal commitment must not be mutated");
    },
  } as unknown as PoolClient;

  const result = await persistVerifiedSubmission(client, {
    userId: "alice",
    commitmentId: "123e4567-e89b-12d3-a456-426614174000",
    hash: "abc",
    submitted: { mimeType: "image/jpeg", base64: "YWJj" },
    evidenceType: "photo",
    verdict: { verdict: "ok", whatISee: "done", okan: "ok", score: 90 },
    engine: "demo",
    contract: { goal: "goal", deadline: "today", evidence: "photo", penalty: 100 },
  });

  assert.equal(result.outcome, "closed");
  assert.equal(queries.length, 2);
  assert.match(queries[0].sql, /users WHERE id=\$1 FOR UPDATE/);
  assert.match(queries[1].sql, /id=\$1 AND user_id=\$2 FOR UPDATE/);
  assert.deepEqual(queries[1].params, ["123e4567-e89b-12d3-a456-426614174000", "alice"]);
});

test("disabled checkout response still establishes the isolated session cookie", {
  skip: checkoutEnabled,
}, async () => {
  const response = await checkoutPost(new Request("https://example.test/api/penalty/checkout", {
    method: "POST",
    body: JSON.stringify({ commitmentId: "123e4567-e89b-12d3-a456-426614174000" }),
  }));
  assert.equal(response.status, 503);
  assert.match(response.headers.get("set-cookie") ?? "", /HttpOnly/i);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});
