import { defineConfig } from "@playwright/test";

// e2e 는 항상 Mock Drive 서버(:3210)를 쓴다. 개발용 dev 서버(실 Drive)와 distDir 을 분리해 동시에 띄울 수 있다.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  use: { baseURL: "http://localhost:3210", headless: true },
  webServer: {
    command: "NEXT_DIST_DIR=.next-e2e DRIVE_CLIENT=mock npm run dev -- --port 3210",
    url: "http://localhost:3210",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
