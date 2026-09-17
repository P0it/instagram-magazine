import { expect, test } from "@playwright/test";

const POST = "2026-09-11_youth-housing-support";

test("home 3-stage board → builder → preset switch → sticker → export 1080x1350 JPEG", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/home");
  // 계정 목록은 system status 에서 오므로 콜드 스타트 땐 조금 기다린다
  await expect(page.getByRole("heading", { name: /@life\.magazine — 라이프/ })).toBeVisible({ timeout: 30_000 });
  // 3단계 세그먼트
  await expect(page.getByRole("tab", { name: /^초안 \d+/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /^편집 중 \d+/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /^게시됨 \d+/ })).toBeVisible();

  // 서버가 오래 떠 있으면 이전 실행의 자동 저장으로 "편집 중" 으로 옮겨가 있을 수 있다
  const card = page.getByRole("link", { name: /월세 내고 있다면/ }).first();
  if (!(await card.waitFor({ timeout: 8000 }).then(() => true, () => false))) await page.getByRole("tab", { name: /편집 중/ }).click();
  await card.click();
  await expect(page).toHaveURL(new RegExp(`/editor/${POST}`));

  // 캔버스 렌더
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });

  // 오른쪽 패널 프리셋 탭에서 전환 → 자동 저장
  await page.getByRole("tab", { name: "프리셋" }).click();
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
  await page.getByTitle("위로").click();

  // 포스트 패널(속성 탭, 선택 없음)에서 JPEG 내려받기 — 4장
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "포스트" }).click();
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
  // life.magazine 은 팩트체크 필수 → CTA 비활성 + 사유 표시
  await expect(page.getByRole("button", { name: /인스타그램에 게시하기/ })).toBeDisabled();
  await expect(page.getByText(/팩트체크 승인/)).toBeVisible();

  await page.goto(`/publish/${POST}`);
  await expect(page.getByText(/렌더 \d+ \/ 4/)).toBeVisible();
  await expect(page.getByText("렌더 수 = 슬라이드 수")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "승인" })).toBeDisabled();
});

test("mock connect adds a channel tab and an inbox folder; disconnect removes the tab", async ({ page }) => {
  await page.goto("/settings/accounts");
  await page.getByLabel("Mock 계정 username").fill("@New.Channel");
  await page.getByRole("button", { name: "가짜 연결" }).click();
  await expect(page.getByText(/inbox\/new\.channel\//)).toBeVisible();
  // 상단바에 채널 탭이 생기고 홈이 빈 보드로 열린다
  await expect(page.getByRole("navigation").getByRole("button", { name: "new.channel" })).toBeVisible();
  await page.goto("/home?ch=new.channel");
  await expect(page.getByRole("heading", { name: /@new\.channel/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("tab", { name: /^초안 0/ })).toBeVisible();
  // 연결 해제 → 탭 사라짐
  await page.goto("/settings/accounts");
  await page.getByTestId("account-card-new.channel").getByRole("button", { name: "연결 해제" }).click();
  await expect(page.getByTestId("account-card-new.channel")).toHaveCount(0);
  await expect(page.getByRole("navigation").getByRole("button", { name: "new.channel" })).toHaveCount(0);
});

test("settings and queue render under the top bar", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "계정 · 채널" })).toBeVisible();
  await expect(page.getByTestId("account-card-life.magazine")).toBeVisible();
  await expect(page.getByTestId("account-card-trend.magazine")).toBeVisible();
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

  await page.goto("/home?ch=trend.magazine");
  await page.getByRole("tab", { name: "성과" }).click();
  await expect(page.getByText("프로필 방문")).toBeVisible();
  await expect(page.getByRole("heading", { name: /일별 도달/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "TOP 게시물" })).toBeVisible();
  await expect(page.getByRole("link", { name: /한남동/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /채널 비교/ })).toBeVisible();

  // 기간 전환
  await page.getByRole("tab", { name: "7일" }).click();
  await expect(page.getByRole("heading", { name: /일별 도달 · 7일/ })).toBeVisible();

  // Mock 계정의 가짜 토큰으로는 IG API 수집이 실패 → 실패 토스트 (계정 2개)
  await page.getByRole("button", { name: "지금 수집" }).click();
  await expect(page.getByText(/수집 0\/\d+ · 실패/)).toBeVisible({ timeout: 20_000 });

  expect(errors).toEqual([]);
});

test("post format 1:1 → export 1080x1080, fonts and element library are present", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/editor/${POST}`);
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });

  // 포스트 패널에서 규격 전환
  await page.keyboard.press("Escape");
  // 이전 실행이 남긴 규격과 무관하게 실제 전환이 한 번은 일어나도록 3:4 를 거쳐 1:1 로
  await page.getByRole("tab", { name: "3:4", exact: true }).click();
  await page.waitForTimeout(2500);
  await page.getByRole("tab", { name: "1:1", exact: true }).click();
  await expect(page.getByText("1:1 · 1080 × 1080")).toBeVisible();
  await expect(page.getByText(/저장됨 · 방금/)).toBeVisible({ timeout: 10_000 });

  const downloads: Promise<import("@playwright/test").Download>[] = [];
  page.on("download", (d) => downloads.push(Promise.resolve(d)));
  await page.getByRole("button", { name: /JPEG 내려받기/ }).click();
  await page.waitForTimeout(5000);
  expect(downloads.length).toBe(4);
  const fs = await import("node:fs");
  const buf = fs.readFileSync((await (await downloads[0]).path())!);
  expect(readJpegDims(buf)).toEqual({ width: 1080, height: 1080 });

  // 폰트 7종
  await page.getByRole("tab", { name: "레이어" }).click();
  await page.getByRole("button", { name: /^텍스트 · / }).click();
  await page.getByRole("button", { name: /폰트 · 이 레이어만/ }).click();
  await expect(page.getByText("나눔명조")).toBeVisible();
  await expect(page.getByText("개구 손글씨")).toBeVisible();

  // 요소 탭: 누끼 · 프리셋 탭: 스크린샷 분석 진입점
  await page.getByRole("tab", { name: "요소" }).click();
  await expect(page.getByRole("button", { name: /배경 지워서 라이브러리에 담기/ })).toBeEnabled();
  await page.getByRole("tab", { name: "프리셋" }).click();
  await expect(page.getByRole("button", { name: "레이아웃 읽어 등록" })).toBeEnabled();

  // 되돌리기: 4:5 로
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "포스트" }).click();
  await page.getByRole("tab", { name: "4:5", exact: true }).click();
  await expect(page.getByText(/저장됨 · 방금/)).toBeVisible({ timeout: 10_000 });
  expect(errors).toEqual([]);
});
