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

  test("카드에 키보드로 포커스해도 ← → 로 넘길 수 있고, 열고 나면 뒤 카드는 반응하지 않는다", async ({ page }) => {
    const multi = page.getByTestId("reference-card").filter({ hasText: "e2e 캐러셀" }).first();
    await expect(multi).toBeVisible({ timeout: 30_000 });
    await multi.getByRole("button", { name: /열기/ }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(multi.getByTestId("slide-count")).toHaveText("2/3");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "레퍼런스 상세" })).toBeVisible();
    await page.keyboard.press("Escape");
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
    await page.getByRole("button", { name: "인용", exact: true }).click();
    const cafe = await cards.count();
    expect(cafe).toBeGreaterThan(0);
    expect(cafe).toBeLessThan(total);
    await page.getByRole("button", { name: "전체", exact: true }).click();
    await expect(cards).toHaveCount(total);
  });
});

test("선택한 계정은 레퍼런스·템플릿·설정으로 옮겨 가도 유지된다", async ({ page }) => {
  await page.goto("/home?ch=trend.magazine");
  await expect(page.locator('aside button[title^="@"]')).toHaveAttribute("title", "@trend.magazine", { timeout: 30_000 });
  await page.getByRole("link", { name: "레퍼런스" }).click();
  await expect(page).toHaveURL(/ch=trend\.magazine/);
  await expect(page.locator('aside button[title^="@"]')).toHaveAttribute("title", "@trend.magazine");
  await page.getByRole("link", { name: "콘텐츠 만들기" }).click();
  await expect(page.getByRole("heading", { name: /@trend\.magazine/ })).toBeVisible({ timeout: 30_000 });
});

test("레퍼런스 상세에서 고치던 내용이 있으면 ↓ 키로 다른 레퍼런스로 넘어가지 않는다", async ({ page }) => {
  await addRef(page, `e2e 편집 A ${Date.now()}`, 1);
  await addRef(page, `e2e 편집 B ${Date.now()}`, 1);
  await page.goto("/references");
  await page.getByTestId("reference-card").first().click({ position: { x: 20, y: 120 } });
  const dialog = page.getByRole("dialog", { name: "레퍼런스 상세" });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByLabel("메모").fill("지우면 안 되는 메모");
  await dialog.getByText(/인스타 피드/).first().click(); // 입력창 밖으로 포커스 이동
  await page.keyboard.press("ArrowDown");
  await expect(dialog.getByLabel("메모")).toHaveValue("지우면 안 되는 메모");
});

test("계정 상태 점은 연결 상태를 따른다", async ({ page }) => {
  await page.goto("/home");
  const trigger = page.locator('aside button[title^="@"]');
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  await expect(trigger.getByText("Instagram 연결됨")).toBeVisible();
  await expect(trigger.locator("span.bg-positive")).toHaveCount(1);
});

test("마지막으로 고른 계정은 ?ch= 없이 다시 열어도 기억된다", async ({ page }) => {
  const trigger = page.locator('aside button[title^="@"]');
  await page.goto("/home?ch=trend.magazine");
  await expect(trigger).toHaveAttribute("title", "@trend.magazine", { timeout: 30_000 });
  await page.goto("/home");
  await expect(trigger).toHaveAttribute("title", "@trend.magazine", { timeout: 30_000 });
});

test("계정 목록에서 고르거나 Alt+방향키로 바로 전환한다", async ({ page }) => {
  const trigger = page.locator('aside button[title^="@"]');
  await page.goto("/home?ch=life.magazine");
  await expect(trigger).toHaveAttribute("title", "@life.magazine", { timeout: 30_000 });
  await page.keyboard.press("Alt+ArrowDown");
  await expect(trigger).toHaveAttribute("title", "@trend.magazine");
  await page.keyboard.press("Alt+ArrowUp");
  await expect(trigger).toHaveAttribute("title", "@life.magazine");
  await trigger.click();
  await page.getByRole("menuitem", { name: /@trend\.magazine/ }).click();
  await expect(trigger).toHaveAttribute("title", "@trend.magazine");
});
