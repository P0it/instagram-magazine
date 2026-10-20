import { expect, test } from "@playwright/test";

test("앱은 Instagram 다크 톤으로 고정된다", async ({ page }) => {
  await page.goto("/home");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(0, 0, 0)");
  expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);
});
