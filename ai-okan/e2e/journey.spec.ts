import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

// Uses real routes and a real test database, with no AI keys and no paid calls.
test("a visitor can inspect, promise, record a demo penalty and reset", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  async function capture(name: string) {
    if (process.env.CAPTURE_SCREENSHOTS && testInfo.project.name === "desktop") {
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: resolve("../docs/screenshots", `${name}.png`), fullPage: true, animations: "disabled" });
    }
  }
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("おかんが見たるわ");
  await capture("01-home");
  await page.getByRole("button", { name: "おかんに自分を知ってもらう" }).click();
  await page.getByRole("button", { name: "これでおかんに見てもらう" }).click();
  await expect(page).toHaveURL(/\/dossier$/);
  await expect(page.getByText("デモモード（固定応答）")).toBeVisible();
  await capture("02-dossier");
  await page.getByRole("button", { name: "おかんと約束する" }).click();
  await page.getByLabel("何をやる", { exact: true }).fill("参考書を10ページ進める");
  await page.getByLabel("何を証拠に出す", { exact: true }).fill("取り組んだページがわかる写真");
  await capture("03-promise");
  await page.getByRole("button", { name: "この条件で約束する" }).click();
  await expect(page.getByText("約束が成立しました")).toBeVisible();
  await page.getByRole("button", { name: "おかんに見張ってもらう" }).click();
  await expect(page).toHaveURL(/\/watch$/); // Private goal text does not go in the URL.
  await page.reload();
  await expect(page.getByText("参考書を10ページ進める", { exact: true })).toBeVisible();
  const response = page.waitForResponse((res) => res.url().endsWith("/api/verify") && res.request().method() === "POST");
  await page.locator('input[type="file"]').setInputFiles({
    name: "demo-proof.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64"),
  });
  const result = await response;
  expect(result.ok()).toBeTruthy();
  expect((await result.json()).persisted).toBe(true);
  await expect(page.getByText(/証拠としての信頼度/)).toBeVisible();
  await capture("04-watch");
  await page.getByRole("button", { name: "期限切れにする（デモ用）" }).click();
  await expect(page.getByText("デモの罰金を記録しました", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "もう一度、約束をやり直す" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/watch");
  await expect(page).toHaveURL(/\/ingest$/);
  expect(errors).toEqual([]);
});

test("missing sources offer a retry and unknown pages offer a way home", async ({ page }) => {
  await page.route("**/api/sources", (route) => route.fulfill({ status: 503, body: "unavailable" }));
  await page.goto("/ingest");
  await expect(page.getByRole("alert").filter({ hasText: "元データを読み込めませんでした" })).toBeVisible();
  await page.unroute("**/api/sources");
  await page.getByRole("button", { name: "再読み込み" }).click();
  await expect(page.getByRole("button", { name: "これでおかんに見てもらう" })).toBeEnabled();
  await page.goto("/this-page-does-not-exist");
  await expect(page.getByRole("heading", { name: "ページが見つかりません" })).toBeVisible();
});
