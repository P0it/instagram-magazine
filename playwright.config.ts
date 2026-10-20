import { defineConfig } from "@playwright/test";

// E2E_BASE_URL 이 있으면 이미 떠 있는 dev 서버를 그대로 쓴다 (Next 16 은 디렉터리당 dev 서버 1개만 허용)
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  use: { baseURL: external ?? "http://localhost:3210", headless: true },
  webServer: external
    ? undefined
    : {
        command: "npm run dev -- --port 3210",
        url: "http://localhost:3210",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
