import { expect, test } from "@playwright/test";

test("앱은 Instagram 다크 톤으로 고정된다", async ({ page }) => {
  await page.goto("/home");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(0, 0, 0)");
  expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);
});

test("사이드바에 5개 메뉴가 있고 채널 구분 탭은 없다", async ({ page }) => {
  await page.goto("/home");
  const nav = page.getByRole("navigation", { name: "주 메뉴" }).or(page.getByLabel("주 메뉴"));
  for (const name of ["레퍼런스", "템플릿", "콘텐츠 만들기", "게시 큐", "설정"]) {
    await expect(page.getByRole("link", { name })).toBeVisible();
  }
  await expect(nav.getByText(/라이프|마인드|트렌드/)).toHaveCount(0);
  await page.getByRole("link", { name: "레퍼런스" }).click();
  await expect(page).toHaveURL(/\/references/);
});
