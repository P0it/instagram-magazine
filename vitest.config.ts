import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: [
      { find: "server-only", replacement: path.resolve(__dirname, "tests/shims/server-only.ts") },
      { find: "next/cache", replacement: path.resolve(__dirname, "tests/shims/next-cache.ts") },
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, "src") + "/$1" },
    ],
  },
});
