import { expect, test, type Page } from "@playwright/test";

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

test("어느 화면에도 라이프·마인드·트렌드 구분이 보이지 않는다", async ({ page }) => {
  await page.goto("/home");
  await expect(page.getByRole("heading", { name: /@life\.magazine/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/라이프|마인드|트렌드/)).toHaveCount(0);
});

// 1x1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const file = (n: number) => ({ name: `s${n}.png`, mimeType: "image/png", buffer: PNG });

/** 레퍼런스를 만들고 이미지를 images 장까지 채운다 (multipart 는 같은 키를 한 번만 받으므로 장마다 한 번씩 올린다) */
async function addRef(page: Page, title: string, images: number) {
  const created = await page.request.post("/api/references", { multipart: { meta: JSON.stringify({ title, kind: "feed" }), files: file(0) } });
  expect(created.ok()).toBeTruthy();
  const list = (await created.json()) as { references: { id: string; title: string }[] };
  const id = list.references.find((r) => r.title === title)!.id;
  for (let n = 1; n < images; n++) {
    const more = await page.request.post(`/api/references/${id}/images`, { multipart: { files: file(n) } });
    expect(more.ok()).toBeTruthy();
  }
}

test.describe("레퍼런스 보드", () => {
  test.beforeEach(async ({ page }) => {
    await addRef(page, `e2e 단일 ${Date.now()}`, 1);
    await addRef(page, `e2e 캐러셀 ${Date.now()}`, 3);
    await page.goto("/references");
  });

  test("카드는 모두 같은 크기이고 넘기기 컨트롤은 다장 카드에만 있다", async ({ page }) => {
    const cards = page.getByTestId("reference-card");
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });
    const boxes = await cards.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; }));
    expect(new Set(boxes).size).toBe(1);
    const multi = cards.filter({ hasText: "e2e 캐러셀" }).first();
    const single = cards.filter({ hasText: "e2e 단일" }).first();
    await expect(single.getByRole("button", { name: "다음 슬라이드" })).toHaveCount(0);
    await expect(single.getByTestId("slide-count")).toHaveCount(0);
    await multi.hover();
    await multi.getByRole("button", { name: "다음 슬라이드" }).click();
    await expect(multi.getByTestId("slide-count")).toHaveText("2/3");
    await multi.getByRole("button", { name: "다음 슬라이드" }).click();
    await expect(multi.getByRole("button", { name: "다음 슬라이드" })).toHaveCount(0);
    await multi.getByRole("button", { name: "이전 슬라이드" }).click();
    await expect(multi.getByTestId("slide-count")).toHaveText("2/3");
  });

  test("검색창에서 방향키는 슬라이드를 넘기지 않고, 카드를 누르면 상세가 열리고 Esc 로 닫힌다", async ({ page }) => {
    const multi = page.getByTestId("reference-card").filter({ hasText: "e2e 캐러셀" }).first();
    await expect(multi).toBeVisible({ timeout: 30_000 });
    await multi.hover();
    await page.getByLabel("검색").focus();
    await page.keyboard.press("ArrowRight");
    await expect(multi.getByTestId("slide-count")).toHaveText("1/3");
    await multi.click({ position: { x: 20, y: 120 } });
    await expect(page.getByRole("dialog", { name: "레퍼런스 상세" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "레퍼런스 상세" })).toHaveCount(0);
  });
});

test.describe("템플릿 화면", () => {
  test("내장 템플릿을 격자로 보여주고 분류 칩으로 거른다", async ({ page }) => {
    await page.goto("/templates");
    await expect(page.getByRole("heading", { name: "템플릿" })).toBeVisible({ timeout: 30_000 });
    const cards = page.getByTestId("template-card");
    await expect(cards.first()).toBeVisible();
    const total = await cards.count();
    expect(total).toBeGreaterThan(3);
    await page.getByRole("button", { name: "카페", exact: true }).click();
    const cafe = await cards.count();
    expect(cafe).toBeGreaterThan(0);
    expect(cafe).toBeLessThan(total);
    await page.getByRole("button", { name: "전체", exact: true }).click();
    await expect(cards).toHaveCount(total);
  });
});
