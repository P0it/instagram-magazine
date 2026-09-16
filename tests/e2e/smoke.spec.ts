import { expect, test } from "@playwright/test";

const POST = "2026-09-11_youth-housing-support";

test("home 3-stage board → builder → preset switch → sticker → export 1080x1350 JPEG", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/home");
  await expect(page.getByRole("heading", { name: /LIFE — 생활·주거/ })).toBeVisible();
  // 3단계 세그먼트
  await expect(page.getByRole("tab", { name: /^초안 \d+/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /^편집 중 \d+/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /^게시됨 \d+/ })).toBeVisible();

  await page.getByRole("link", { name: /월세 내고 있다면/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`/editor/${POST}`));

  // 캔버스 렌더
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });

  // 프리셋 전환 → 자동 저장
  await page.getByRole("button", { name: /Cover Center/ }).click();
  await expect(page.getByText(/저장됨 · 방금/)).toBeVisible({ timeout: 10_000 });

  // 요소 탭에서 스티커 추가 → 요소 레이어 패널
  await page.getByRole("tab", { name: "요소" }).click();
  await page.getByRole("button", { name: "테이프" }).click();
  await expect(page.getByText("요소 레이어")).toBeVisible();

  // 슬라이드 순서 변경: 2번 선택 후 왼쪽으로
  const thumbs = page.getByTestId("slide-thumb");
  await expect(thumbs).toHaveCount(4);
  await thumbs.nth(1).click();
  await thumbs.nth(1).hover();
  await page.getByTitle("왼쪽으로").click();

  // 포스트 패널에서 JPEG 내려받기 — 4장
  await page.keyboard.press("Escape");
  const downloads: Promise<import("@playwright/test").Download>[] = [];
  page.on("download", (d) => downloads.push(Promise.resolve(d)));
  await page.getByRole("button", { name: /JPEG 내려받기/ }).click();
  await page.waitForTimeout(5000);
  expect(downloads.length).toBe(4);
  const first = await downloads[0];
  expect(first.suggestedFilename()).toMatch(/slide_01\.jpg$/);
  const path = await first.path();
  expect(path).toBeTruthy();
  const fs = await import("node:fs");
  const buf = fs.readFileSync(path!);
  expect(buf[0]).toBe(0xff);
  expect(buf[1]).toBe(0xd8);
  expect(readJpegDims(buf)).toEqual({ width: 1080, height: 1350 });

  expect(errors).toEqual([]);
});

test("publish sheet blocks on fact-check, publish page shows checklist", async ({ page }) => {
  await page.goto(`/editor/${POST}`);
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "게시", exact: true }).click();
  await expect(page.getByRole("heading", { name: "인스타그램에 게시할까요?" })).toBeVisible();
  // LIFE 는 팩트체크 필수 → CTA 비활성 + 사유 표시
  await expect(page.getByRole("button", { name: /인스타그램에 게시하기/ })).toBeDisabled();
  await expect(page.getByText(/팩트체크 승인/)).toBeVisible();

  await page.goto(`/publish/${POST}`);
  await expect(page.getByText(/렌더 \d+ \/ 4/)).toBeVisible();
  await expect(page.getByText("렌더 수 = 슬라이드 수")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "승인" })).toBeDisabled();
});

test("settings and queue render under the top bar", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "인스타그램 계정" })).toBeVisible();
  await page.goto("/queue");
  await expect(page.getByRole("heading", { name: /게시 큐/ })).toBeVisible();
});

function readJpegDims(buf: Buffer): { width: number; height: number } | null {
  let off = 2;
  while (off + 9 < buf.length) {
    if (buf[off] !== 0xff) { off++; continue; }
    const marker = buf[off + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) { off += 2; continue; }
    const len = buf.readUInt16BE(off + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
    }
    off += 2 + len;
  }
  return null;
}

test("home 성과 tab shows insight tiles, top posts and channel comparison from mock snapshots", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/home?ch=TREND");
  await page.getByRole("tab", { name: "성과" }).click();
  await expect(page.getByText("프로필 방문")).toBeVisible();
  await expect(page.getByRole("heading", { name: /일별 도달/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "TOP 게시물" })).toBeVisible();
  await expect(page.getByRole("link", { name: /한남동/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /채널 비교/ })).toBeVisible();

  // 기간 전환
  await page.getByRole("tab", { name: "7일" }).click();
  await expect(page.getByRole("heading", { name: /일별 도달 · 7일/ })).toBeVisible();

  // 계정 없는 mock 에서 수집은 안내 토스트
  await page.getByRole("button", { name: "지금 수집" }).click();
  await expect(page.getByText(/연결된 Instagram 계정이 없어요/)).toBeVisible();

  expect(errors).toEqual([]);
});
