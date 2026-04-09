import percySnapshot from "@percy/playwright";
import { test, expect } from "@playwright/test";

test.describe("visual smoke", () => {
  test("home loads", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    if (process.env.PERCY_TOKEN) {
      await percySnapshot(page, "mnotation-home");
    }
  });
});
