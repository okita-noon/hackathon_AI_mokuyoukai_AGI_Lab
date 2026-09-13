import assert from "node:assert/strict";
import test from "node:test";
import { CHECKOUT_SESSION_ID, appBaseUrl, checkoutSessionParams } from "../lib/backend/checkout";

test("builds the return URL from the configured base URL first", () => {
  const headers = new Headers({ host: "evil.example" });
  assert.equal(appBaseUrl(headers, "https://okan.example/"), "https://okan.example");
});

test("builds the return URL from proxy headers", () => {
  assert.equal(
    appBaseUrl(new Headers({ "x-forwarded-host": "okan.run.app", "x-forwarded-proto": "https,http" }), ""),
    "https://okan.run.app",
  );
  assert.equal(appBaseUrl(new Headers({ host: "localhost:3000" }), ""), "http://localhost:3000");
  assert.equal(appBaseUrl(new Headers({ host: "okan.run.app" }), ""), "https://okan.run.app");
});

test("charges the penalty in yen and returns to the paid page", () => {
  const params = checkoutSessionParams({
    commitmentId: "123e4567-e89b-12d3-a456-426614174000",
    goal: "ジムへ行く",
    amount: 3000,
    baseUrl: "https://okan.run.app",
  });
  assert.equal(params.line_items[0].price_data.currency, "jpy");
  assert.equal(params.line_items[0].price_data.unit_amount, 3000);
  assert.equal(params.metadata.commitment_id, "123e4567-e89b-12d3-a456-426614174000");
  assert.equal(params.success_url, "https://okan.run.app/penalty/paid?session_id={CHECKOUT_SESSION_ID}");
});

test("accepts only Checkout session ids", () => {
  assert.ok(CHECKOUT_SESSION_ID.test("cs_test_a1B2c3"));
  assert.ok(!CHECKOUT_SESSION_ID.test("cs_test_a1/../x"));
  assert.ok(!CHECKOUT_SESSION_ID.test("pi_123"));
});
