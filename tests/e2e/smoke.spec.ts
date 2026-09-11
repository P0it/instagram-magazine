import { expect, test } from "@playwright/test";

const POST = "2026-09-11_youth-housing-support";

test("dashboard → library → editor → preset switch → export 1080x1350 JPEG", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /데스크/ })).toBeVisible();

  await page.goto("/library");
  await expect(page.getByRole("heading", { name: /라이브러리/ })).toBeVisible();
  await page.getByRole("link", { name: /월세 내고 있다면/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`/editor/${POST}`));

  // 캔버스 렌더
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });

  // 프리셋 전환
  await page.getByRole("button", { name: /Cover Center/ }).click();
  await expect(page.getByText("● 저장되지 않음")).toBeVisible();

  // 슬라이드 순서 변경: 2번 선택 후 왼쪽으로
  const thumbs = page.getByTestId("slide-thumb");
  await expect(thumbs).toHaveCount(4);
  await thumbs.nth(1).click();
  await thumbs.nth(1).hover();
  await page.getByTitle("왼쪽으로").click();

  // 내보내기 — 4장 다운로드
  const downloads: Promise<import("@playwright/test").Download>[] = [];
  page.on("download", (d) => downloads.push(Promise.resolve(d)));
  await page.getByRole("button", { name: /JPEG/ }).click();
  await page.waitForTimeout(4000);
  expect(downloads.length).toBe(4);
  const first = await downloads[0];
  expect(first.suggestedFilename()).toMatch(/slide_01\.jpg$/);
  const path = await first.path();
  expect(path).toBeTruthy();
  const fs = await import("node:fs");
  const buf = fs.readFileSync(path!);
  // JPEG SOI + 크기 확인
  expect(buf[0]).toBe(0xff);
  expect(buf[1]).toBe(0xd8);
  const dims = readJpegDims(buf);
  expect(dims).toEqual({ width: 1080, height: 1350 });

  expect(errors).toEqual([]);
});

test("save + render uploads to mock drive, publish page shows checklist", async ({ page }) => {
  await page.goto(`/editor/${POST}`);
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /저장 \+ 렌더/ }).click();
  await expect(page.getByText(/저장 완료 · 렌더 4장/)).toBeVisible({ timeout: 20_000 });

  await page.goto(`/publish/${POST}`);
  await expect(page.getByText(/렌더 \(4 \/ 4\)/)).toBeVisible();
  await expect(page.getByText("렌더 수 = 슬라이드 수")).toBeVisible({ timeout: 20_000 });
  // LIFE 는 팩트체크 필수 → 승인 버튼 비활성
  await expect(page.getByRole("button", { name: "승인" })).toBeDisabled();
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
