import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { resetEnvCache } from "@/lib/env";
import { AiError } from "@/lib/ai/provider/types";
import { extractJson, parseJsonReply } from "@/lib/ai/provider/json-reply";
import { clearTokens, encodeTokenEnv, getTokens, parseTokenEnv, resetTokenCacheForTests, setTokens } from "@/lib/ai/provider/token-store";
import { getProvider, listProviderStatus, resetProviders, setProviders } from "@/lib/ai/provider/registry";
import { MockAiProvider } from "@/mocks/ai/MockAiProvider";

const tokens = { access: "acc-1", refresh: "ref-1", expires_at: "2026-10-21T01:00:00.000Z", account: "me@example.com" };

beforeEach(() => {
  resetEnvCache();
  resetTokenCacheForTests();
  resetProviders();
  delete process.env.AI_CLAUDE_TOKENS;
  delete process.env.AI_CHATGPT_TOKENS;
  delete process.env.AI_DEFAULT_PROVIDER;
});

describe("token env encoding", () => {
  it("round-trips and returns null for broken values", () => {
    expect(parseTokenEnv(encodeTokenEnv(tokens))).toEqual(tokens);
    expect(parseTokenEnv("%%%not-base64%%%")).toBeNull();
    expect(parseTokenEnv(Buffer.from(JSON.stringify({ access: 1 })).toString("base64url"))).toBeNull();
    expect(parseTokenEnv("")).toBeNull();
  });
});

describe("extractJson", () => {
  it("reads json out of code fences and surrounding prose", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('설명입니다.\n{"a":{"b":[1,2]}}\n끝')).toEqual({ a: { b: [1, 2] } });
    expect(extractJson('{"t":"}{ 중괄호 문자열"}')).toEqual({ t: "}{ 중괄호 문자열" });
  });

  it("throws invalid_output for truncated or missing json", () => {
    for (const bad of ['{"a":', "그냥 글", ""]) {
      try {
        extractJson(bad);
        throw new Error("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(AiError);
        expect((e as AiError).kind).toBe("invalid_output");
      }
    }
  });

  it("parseJsonReply validates against the schema", () => {
    const S = z.object({ n: z.number() });
    expect(parseJsonReply(S, '{"n":2}')).toEqual({ n: 2 });
    expect(() => parseJsonReply(S, '{"n":"x"}')).toThrowError(AiError);
  });
});

describe("token store", () => {
  it("serializes concurrent writes so no env line is lost, and exposes tokens via getTokens", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ai-tokens-"));
    const file = path.join(dir, ".env.local");
    await writeFile(file, "KEEP=1\n", "utf8");
    await Promise.all([setTokens("claude", tokens, file), setTokens("chatgpt", { ...tokens, access: "acc-2" }, file)]);
    const text = await readFile(file, "utf8");
    expect(text).toContain("KEEP=1");
    expect(text).toContain("AI_CLAUDE_TOKENS=");
    expect(text).toContain("AI_CHATGPT_TOKENS=");
    expect(getTokens("claude")?.access).toBe("acc-1");
    expect(getTokens("chatgpt")?.access).toBe("acc-2");
    await clearTokens("claude", file);
    expect(getTokens("claude")).toBeNull();
    expect(getTokens("chatgpt")?.access).toBe("acc-2");
  });

  it("keeps the old cache when the file write fails", async () => {
    const bad = path.join(tmpdir(), "no-such-dir-ai", "deeper", ".env.local");
    await expect(setTokens("claude", tokens, bad)).rejects.toMatchObject({ kind: "auth" });
    expect(getTokens("claude")).toBeNull();
  });
});

describe("MockAiProvider", () => {
  const S = z.object({ n: z.number() });
  it("returns queued replies in order and records the calls", async () => {
    const m = new MockAiProvider({ replies: [{ n: 1 }, { n: 2 }] });
    expect(await m.complete({ system: "s", user: "u", schema: S })).toEqual({ n: 1 });
    expect(await m.complete({ system: "s", user: "u2", schema: S })).toEqual({ n: 2 });
    expect(m.calls.map((c) => c.user)).toEqual(["u", "u2"]);
  });

  it("throws invalid_output when a reply does not match the schema", async () => {
    const m = new MockAiProvider({ replies: [{ n: "x" }] });
    await expect(m.complete({ system: "s", user: "u", schema: S })).rejects.toMatchObject({ kind: "invalid_output" });
  });
});

describe("registry", () => {
  const mk = (id: "claude" | "chatgpt", connected: boolean) => new MockAiProvider({ id, connected, replies: [] });

  it("prefers the configured default when both are connected", async () => {
    setProviders([mk("claude", true), mk("chatgpt", true)]);
    process.env.AI_DEFAULT_PROVIDER = "chatgpt";
    resetEnvCache();
    expect((await getProvider()).id).toBe("chatgpt");
    process.env.AI_DEFAULT_PROVIDER = "claude";
    resetEnvCache();
    expect((await getProvider()).id).toBe("claude");
    expect((await getProvider("claude")).id).toBe("claude");
  });

  it("falls back to the only connected provider", async () => {
    setProviders([mk("claude", false), mk("chatgpt", true)]);
    process.env.AI_DEFAULT_PROVIDER = "claude";
    expect((await getProvider()).id).toBe("chatgpt");
  });

  it("throws an auth error when nothing is connected", async () => {
    setProviders([mk("claude", false), mk("chatgpt", false)]);
    await expect(getProvider()).rejects.toMatchObject({ kind: "auth" });
    expect((await listProviderStatus()).map((s) => s.connected)).toEqual([false, false]);
  });
});
