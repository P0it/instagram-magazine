import { expect, test } from "@playwright/test";

// 1x1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("settings > AI shows the provider, and generating from a reference lands a draft on the home board", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // 설정 > AI — Mock 모드는 로그인된 제공자 하나를 돌려준다
  await page.goto("/settings/ai");
  await expect(page.getByText("AI 생성기")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Claude", { exact: true })).toBeVisible();
  await expect(page.getByText(/연결됨/)).toBeVisible();

  // 레퍼런스 한 건 만들기
  const title = `AI 생성 e2e ${Date.now()}`;
  const created = await page.request.post("/api/references", {
    multipart: { meta: JSON.stringify({ title, tags: ["카페"], note: "여백이 좋음" }), files: { name: "a.png", mimeType: "image/png", buffer: PNG } },
  });
  expect(created.ok()).toBeTruthy();

  // 상세 → AI로 생성하기 → 지침 → 생성 시작
  await page.goto("/references");
  await page.getByText(title).first().click();
  await page.getByRole("button", { name: "AI로 생성하기" }).click();
  const dialog = page.getByRole("dialog", { name: "AI로 생성하기" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("지침").fill("성수동 봄 카페 3곳");
  await dialog.getByRole("button", { name: "생성 시작" }).click();
  await expect(page.getByText(/생성을 시작했어요/)).toBeVisible();

  // 상단 표시기에서 진행 → 완료되면 "초안 열기" 링크가 나온다
  const indicator = page.getByRole("button", { name: "AI 생성 작업" });
  await expect(indicator).toBeVisible({ timeout: 15_000 });
  await indicator.click();
  await expect(page.getByRole("link", { name: "초안 열기" }).first()).toBeVisible({ timeout: 45_000 });

  // 콘텐츠 만들기 보드의 초안에 새 카드가 있다
  await page.goto("/home");
  await expect(page.getByRole("heading", { name: /@life\.magazine — 라이프/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("tab", { name: /^초안 \d+/ }).click();
  await expect(page.getByRole("link", { name: /봄에 가기 좋은 카페 3곳/ }).first()).toBeVisible({ timeout: 15_000 });

  expect(errors).toEqual([]);
});
