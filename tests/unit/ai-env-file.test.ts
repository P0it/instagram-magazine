import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { persistEnvVar } from "@/lib/ai/provider/env-file";

const KEYS = Array.from({ length: 12 }, (_, i) => `AI_TEST_KEY_${i}`);
afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

describe("persistEnvVar", () => {
  it("keeps every line when many writers hit the same .env.local at once", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-env-"));
    const file = path.join(dir, ".env.local");
    await writeFile(file, "GOOGLE_REFRESH_TOKEN=keep-me\n", "utf8");
    await Promise.all(KEYS.map((k, i) => persistEnvVar(k, `value-${i}`, file)));
    const text = await readFile(file, "utf8");
    expect(text).toContain("GOOGLE_REFRESH_TOKEN=keep-me");
    for (const [i, k] of KEYS.entries()) expect(text).toContain(`${k}=value-${i}`);
  });

  it("writes through a temp file so a crash cannot leave a half-written .env.local", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-env-"));
    const file = path.join(dir, ".env.local");
    await writeFile(file, "A=1\n", "utf8");
    await persistEnvVar(KEYS[0]!, "x", file);
    expect(await readdir(dir)).toEqual([".env.local"]);
  });

  it("keeps one lock across module reloads", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-env-"));
    const file = path.join(dir, ".env.local");
    const { vi } = await import("vitest");
    vi.resetModules();
    const a = await import("@/lib/ai/provider/env-file");
    vi.resetModules();
    const b = await import("@/lib/ai/provider/env-file");
    await Promise.all(KEYS.map((k, i) => (i % 2 ? a : b).persistEnvVar(k, `v${i}`, file)));
    const text = await readFile(file, "utf8");
    for (const k of KEYS) expect(text).toContain(`${k}=`);
  });
});
