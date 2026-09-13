import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY, loadState, patch, reset } from "../lib/store";

test("server reset wins over stale cache; outages alone use cache", async (t) => {
  const memory = new Map<string, string>();
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  t.after(() => {
    for (const [key, descriptor] of [["window", oldWindow], ["localStorage", oldStorage]] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
  } });
  const fetchMock = t.mock.method(globalThis, "fetch", async () => Response.json({ state: null }));
  patch({ step: 4, promiseReply: "stale" });
  assert.deepEqual(await loadState(), EMPTY);
  patch({ step: 2 });
  fetchMock.mock.mockImplementation(async () => Response.json({ state: null, persisted: false }));
  assert.equal((await loadState()).step, 2);
  await assert.rejects(reset(), /リセットできません/);
  assert.equal((await loadState()).step, 2);
  fetchMock.mock.mockImplementation(async () => Response.json({ ok: true }));
  await reset();
  fetchMock.mock.mockImplementation(async () => { throw new Error("offline"); });
  assert.deepEqual(await loadState(), EMPTY);
});
