import { defineConfig } from "@playwright/test";
// 이미 떠 있는 dev 서버(3000)에 붙어 실행할 때: npx playwright test -c playwright.existing.config.ts
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", headless: true },
});
