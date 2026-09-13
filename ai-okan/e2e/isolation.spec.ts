import { test, expect } from "@playwright/test";

test("two independent visitors cannot read, cancel or judge each other's promise", async ({ playwright, baseURL }) => {
  const alice = await playwright.request.newContext({ baseURL });
  const bob = await playwright.request.newContext({ baseURL });
  try {
    const first = await alice.get("/api/okan");
    expect(first.headers()["set-cookie"]).toContain("HttpOnly");
    await bob.get("/api/okan");
    const created = await alice.post("/api/okan", { data: {
      mode: "promise", promise: { goal: "Alice private goal", deadline: "3日以内", evidence: "写真", penalty: 3000 },
    } });
    const { contract, persisted } = await created.json();
    expect(persisted).not.toBe(false);
    expect(contract.id).toBeTruthy();
    expect((await (await bob.get("/api/okan")).json()).state).toBeNull();
    const tampered = await bob.post("/api/verify", { data: {
      promise: contract,
      frames: [{ mimeType: "image/png", base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=" }],
    } });
    expect(tampered.status()).toBe(404);
    await bob.delete("/api/okan");
    expect((await (await alice.get("/api/okan")).json()).state.contract.id).toBe(contract.id);
    await alice.delete("/api/okan");
    expect((await (await alice.get("/api/okan")).json()).state).toBeNull();
  } finally {
    await alice.dispose();
    await bob.dispose();
  }
});
