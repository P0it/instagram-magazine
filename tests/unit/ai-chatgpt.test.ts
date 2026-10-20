import { createHash, createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { resetEnvCache } from "@/lib/env";
import { makePkce } from "@/lib/ai/provider/pkce";
import { verifyIdToken, type Jwks } from "@/lib/ai/provider/jwt";
import { completeChatgptLogin, startChatgptLogin, resetPendingLoginsForTests } from "@/lib/ai/provider/chatgpt-oauth";
import { createChatgptProvider } from "@/lib/ai/provider/chatgpt";
import { getTokens, resetTokenCacheForTests, setTokens } from "@/lib/ai/provider/token-store";

const S = z.object({ n: z.number() });
const ISSUER = "https://auth.openai.com";
const SCOPE = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
const jwks: Jwks = { keys: [jwk] };

function signJwt(payload: Record<string, unknown>, key: KeyObject = privateKey, kid = "k1"): string {
  const head = b64({ alg: "RS256", typ: "JWT", kid });
  const body = b64(payload);
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(key).toString("base64url");
  return `${head}.${body}.${sig}`;
}

const NOW = Date.parse("2026-10-21T03:00:00Z");
const nowSec = Math.floor(NOW / 1000);
const claims = (over: Record<string, unknown> = {}) => ({ iss: ISSUER, aud: "oaiapp_new", sub: "user-1", email: "me@example.com", nonce: "n1", exp: nowSec + 3600, iat: nowSec, ...over });
const expectation = { issuer: ISSUER, audience: "oaiapp_new", nonce: "n1", now: NOW };

describe("pkce", () => {
  it("derives an S256 challenge from the verifier", () => {
    const p = makePkce();
    expect(p.challenge).toBe(createHash("sha256").update(p.verifier).digest("base64url"));
    expect(new Set([p.state, p.nonce, p.verifier]).size).toBe(3);
  });
});

describe("verifyIdToken", () => {
  it("accepts a valid token and returns sub and email", () => {
    expect(verifyIdToken(signJwt(claims()), jwks, expectation)).toMatchObject({ sub: "user-1", email: "me@example.com" });
  });

  it.each([
    ["wrong audience", claims({ aud: "oaiapp_other" })],
    ["wrong issuer", claims({ iss: "https://evil.example" })],
    ["wrong nonce", claims({ nonce: "other" })],
    ["expired", claims({ exp: nowSec - 10 })],
  ])("rejects %s", (_name, c) => {
    expect(() => verifyIdToken(signJwt(c), jwks, expectation)).toThrowError(/로그인|ID 토큰/);
  });

  it("rejects a token signed by another key", () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
    expect(() => verifyIdToken(signJwt(claims(), other), jwks, expectation)).toThrowError(/서명/);
  });
});

let dir: string;
let envFile: string;
beforeEach(async () => {
  resetEnvCache();
  resetTokenCacheForTests();
  resetPendingLoginsForTests();
  delete process.env.AI_CHATGPT_TOKENS;
  delete process.env.AI_CHATGPT_HOST_ID;
  delete process.env.AI_CHATGPT_MODEL;
  dir = await mkdtemp(path.join(tmpdir(), "ai-chatgpt-"));
  envFile = path.join(dir, ".env.local");
  await writeFile(envFile, "KEEP=1\n", "utf8");
});

type Call = { url: string; method: string; headers: Record<string, string>; body: string };
function fakeFetch(handler: (c: Call) => Response | Promise<Response>): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = { url: String(input), method: init?.method ?? "GET", headers: Object.fromEntries(new Headers(init?.headers).entries()), body: typeof init?.body === "string" ? init.body : String(init?.body ?? "") };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return { fetch: f, calls };
}
const jsonRes = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const sse = (...events: unknown[]) => new Response(events.map((e) => `event: x\ndata: ${JSON.stringify(e)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
const delta = (t: string) => ({ type: "response.output_text.delta", delta: t });
const completed = { type: "response.completed", response: {} };

describe("chatgpt login", () => {
  const deps = () => ({ now: () => NOW, envFile });

  it("starts with dynamic registration, a persisted host id and a 127.0.0.1 loopback redirect", async () => {
    const url = new URL(await startChatgptLogin(deps()));
    expect(`${url.origin}${url.pathname}`).toBe("https://auth.openai.com/api/accounts/authorize");
    const q = url.searchParams;
    expect(q.get("client_id")).toBe("dynamic_agent_client");
    expect(q.get("agent_name_hint")).toBeTruthy();
    expect(q.get("response_type")).toBe("code");
    expect(q.get("redirect_uri")).toBe("http://127.0.0.1:3000/api/ai/oauth/chatgpt/callback");
    expect(q.get("scope")).toBe(SCOPE);
    expect(q.get("resource")).toBe("https://api.openai.com/v1");
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("ext_agent_host_id")).toMatch(/^urn:uuid:[0-9a-f-]{36}$/);
    const hostId = q.get("ext_agent_host_id");
    expect(await readFile(envFile, "utf8")).toContain(`AI_CHATGPT_HOST_ID=${hostId}`);
    const again = new URL(await startChatgptLogin(deps()));
    expect(again.searchParams.get("ext_agent_host_id")).toBe(hostId);
    expect(again.searchParams.get("state")).not.toBe(q.get("state"));
  });

  it("re-authorizes with the saved client id and id_token_hint", async () => {
    await setTokens("chatgpt", { access: "a", refresh: "r", expires_at: new Date(NOW).toISOString(), client_id: "oaiapp_saved", id_token: "old.id.token" }, envFile);
    const q = new URL(await startChatgptLogin(deps())).searchParams;
    expect(q.get("client_id")).toBe("oaiapp_saved");
    expect(q.get("id_token_hint")).toBe("old.id.token");
    expect(q.get("agent_name_hint")).toBeNull();
  });

  async function begin() {
    const q = new URL(await startChatgptLogin(deps())).searchParams;
    return { state: q.get("state")!, nonce: q.get("nonce")! };
  }
  const exchange = (nonce: string, over: { scope?: string; aud?: string } = {}) =>
    fakeFetch((c) => {
      if (c.url.endsWith("/.well-known/openid-configuration")) return jsonRes({ issuer: ISSUER, jwks_uri: "https://auth.openai.com/jwks.json" });
      if (c.url === "https://auth.openai.com/jwks.json") return jsonRes(jwks);
      if (c.url === "https://auth.openai.com/api/accounts/oauth/token") {
        return jsonRes({ access_token: "acc-1", refresh_token: "ref-1", id_token: signJwt(claims({ nonce, aud: over.aud ?? "oaiapp_new" })), expires_in: 3600, scope: over.scope ?? SCOPE, token_type: "Bearer" });
      }
      return jsonRes({}, 404);
    });

  it("exchanges the code, validates the id token and stores the tokens with the issued client id", async () => {
    const { state, nonce } = await begin();
    const { fetch, calls } = exchange(nonce);
    await completeChatgptLogin({ code: "code-1", state, client_id: "oaiapp_new", scope: SCOPE }, { ...deps(), fetch });
    const t = getTokens("chatgpt")!;
    expect(t).toMatchObject({ access: "acc-1", refresh: "ref-1", client_id: "oaiapp_new", account: "me@example.com" });
    expect(Date.parse(t.expires_at)).toBe(NOW + 3600_000);
    const form = new URLSearchParams(calls.find((c) => c.url.endsWith("/oauth/token"))!.body);
    expect(Object.fromEntries(form)).toMatchObject({ grant_type: "authorization_code", client_id: "oaiapp_new", code: "code-1", resource: "https://api.openai.com/v1", redirect_uri: "http://127.0.0.1:3000/api/ai/oauth/chatgpt/callback" });
    expect(form.get("code_verifier")).toBeTruthy();
    expect(await readFile(envFile, "utf8")).toContain("AI_CHATGPT_TOKENS=");
  });

  it("rejects a mismatched state without calling the network", async () => {
    await begin();
    const { fetch, calls } = exchange("x");
    await expect(completeChatgptLogin({ code: "c", state: "wrong", client_id: "oaiapp_new" }, { ...deps(), fetch })).rejects.toMatchObject({ kind: "auth" });
    expect(calls).toHaveLength(0);
    expect(getTokens("chatgpt")).toBeNull();
  });

  it("stops on access_denied after checking state", async () => {
    const { state } = await begin();
    const { fetch, calls } = exchange("x");
    await expect(completeChatgptLogin({ error: "access_denied", state }, { ...deps(), fetch })).rejects.toMatchObject({ kind: "auth" });
    expect(calls).toHaveLength(0);
  });

  it("rejects a new registration that returned no client id", async () => {
    const { state, nonce } = await begin();
    await expect(completeChatgptLogin({ code: "c", state }, { ...deps(), fetch: exchange(nonce).fetch })).rejects.toMatchObject({ kind: "auth" });
  });

  it("rejects when the plan-usage scope was not granted", async () => {
    const { state, nonce } = await begin();
    const fetch = exchange(nonce, { scope: "openid profile email offline_access" }).fetch;
    await expect(completeChatgptLogin({ code: "c", state, client_id: "oaiapp_new" }, { ...deps(), fetch })).rejects.toThrowError(/구독 사용 권한/);
    expect(getTokens("chatgpt")).toBeNull();
  });

  it("rejects an id token issued for another client", async () => {
    const { state, nonce } = await begin();
    const fetch = exchange(nonce, { aud: "oaiapp_other" }).fetch;
    await expect(completeChatgptLogin({ code: "c", state, client_id: "oaiapp_new" }, { ...deps(), fetch })).rejects.toMatchObject({ kind: "auth" });
    expect(getTokens("chatgpt")).toBeNull();
  });
});

describe("chatgpt provider", () => {
  const fresh = () => new Date(NOW + 30 * 60_000).toISOString();
  const login = (over: Partial<Parameters<typeof setTokens>[1]> = {}) => setTokens("chatgpt", { access: "acc-1", refresh: "ref-1", expires_at: fresh(), client_id: "oaiapp_new", account: "me@example.com", ...over }, envFile);
  const make = (fetch: typeof globalThis.fetch, extra: { sleeps?: number[] } = {}) =>
    createChatgptProvider({ fetch, now: () => NOW, envFile, sleep: async (ms) => void extra.sleeps?.push(ms) });
  const modelsRes = () => jsonRes({ models: [{ slug: "hidden-model", display_name: "H", visibility: "hide" }, { slug: "gpt-test", display_name: "T", visibility: "list" }] });
  const route = (responses: (c: Call) => Response) => (c: Call) => (c.url.endsWith("/v1/models") ? modelsRes() : responses(c));

  it("status shows login state without any token strings", async () => {
    const p = make(fakeFetch(() => jsonRes({})).fetch);
    expect(await p.status()).toMatchObject({ id: "chatgpt", connected: false, kind: "oauth" });
    await login();
    const s = await p.status();
    expect(s).toMatchObject({ connected: true, account: "me@example.com", expires_at: fresh() });
    expect(JSON.stringify(s)).not.toMatch(/acc-1|ref-1/);
  });

  it("calls the Responses API with the contract fields and the first listed model", async () => {
    await login();
    const { fetch, calls } = fakeFetch(route(() => sse(delta('{"n":'), delta("7}"), completed)));
    const out = await make(fetch).complete({ system: "SYS", user: "USER", schema: S, images: [{ mime: "image/png", bytes: new Uint8Array([1, 2]) }] });
    expect(out).toEqual({ n: 7 });
    const call = calls.find((c) => c.url === "https://api.openai.com/v1/responses")!;
    expect(call.method).toBe("POST");
    expect(call.headers.authorization).toBe("Bearer acc-1");
    const body = JSON.parse(call.body) as Record<string, unknown>;
    expect(body).toMatchObject({ model: "gpt-test", instructions: "SYS", store: false, stream: true });
    for (const banned of ["temperature", "top_p", "max_output_tokens", "user", "metadata", "previous_response_id"]) expect(body).not.toHaveProperty(banned);
    const content = (body.input as { role: string; content: { type: string; text?: string; image_url?: string }[] }[])[0]!;
    expect(content.role).toBe("user");
    expect(content.content[0]).toEqual({ type: "input_text", text: "USER" });
    expect(content.content[1]).toEqual({ type: "input_image", image_url: `data:image/png;base64,${Buffer.from([1, 2]).toString("base64")}` });
  });

  it("refreshes an expiring token once for concurrent calls and persists the rotated refresh token", async () => {
    await login({ expires_at: new Date(NOW + 10_000).toISOString() });
    let refreshes = 0;
    const { fetch, calls } = fakeFetch(
      route((c) => {
        if (c.url === "https://auth.openai.com/api/accounts/oauth/token") {
          refreshes++;
          return jsonRes({ access_token: "acc-2", refresh_token: "ref-2", expires_in: 3600, scope: SCOPE });
        }
        return sse(delta('{"n":1}'), completed);
      }),
    );
    const p = make(fetch);
    await Promise.all([p.complete({ system: "s", user: "u", schema: S }), p.complete({ system: "s", user: "u", schema: S })]);
    expect(refreshes).toBe(1);
    const form = new URLSearchParams(calls.find((c) => c.url.endsWith("/oauth/token"))!.body);
    expect(Object.fromEntries(form)).toMatchObject({ grant_type: "refresh_token", refresh_token: "ref-1", client_id: "oaiapp_new" });
    expect(getTokens("chatgpt")).toMatchObject({ access: "acc-2", refresh: "ref-2", client_id: "oaiapp_new" });
    expect(await readFile(envFile, "utf8")).toContain("AI_CHATGPT_TOKENS=");
    expect(calls.filter((c) => c.url.endsWith("/v1/responses")).every((c) => c.headers.authorization === "Bearer acc-2")).toBe(true);
  });

  it("refreshes and retries once on 401, then gives up with an auth error", async () => {
    await login();
    let n = 0;
    const retried = fakeFetch(
      route((c) => {
        if (c.url.endsWith("/oauth/token")) return jsonRes({ access_token: "acc-2", refresh_token: "ref-2", expires_in: 3600 });
        return n++ === 0 ? new Response("{}", { status: 401 }) : sse(delta('{"n":2}'), completed);
      }),
    );
    expect(await make(retried.fetch).complete({ system: "s", user: "u", schema: S })).toEqual({ n: 2 });

    await login();
    const always401 = fakeFetch(route((c) => (c.url.endsWith("/oauth/token") ? jsonRes({ access_token: "acc-3", refresh_token: "ref-3", expires_in: 3600 }) : new Response("{}", { status: 401 }))));
    await expect(make(always401.fetch).complete({ system: "s", user: "u", schema: S })).rejects.toMatchObject({ kind: "auth" });
  });

  it("asks the user to log in again when the refresh token is rejected", async () => {
    await login({ expires_at: new Date(NOW - 1000).toISOString() });
    const { fetch } = fakeFetch((c) => (c.url.endsWith("/oauth/token") ? jsonRes({ error: "invalid_grant" }, 400) : jsonRes({})));
    await expect(make(fetch).complete({ system: "s", user: "u", schema: S })).rejects.toThrowError(/다시 로그인/);
    expect(getTokens("chatgpt")?.refresh).toBe("ref-1");
  });

  it("retries 429 with backoff and reports quota after the retries run out", async () => {
    await login();
    const sleeps: number[] = [];
    let n = 0;
    const ok = fakeFetch(route(() => (n++ < 2 ? new Response("{}", { status: 429 }) : sse(delta('{"n":3}'), completed))));
    expect(await make(ok.fetch, { sleeps }).complete({ system: "s", user: "u", schema: S })).toEqual({ n: 3 });
    expect(sleeps).toEqual([1000, 2000]);

    const never = fakeFetch(route(() => new Response("{}", { status: 429 })));
    await expect(make(never.fetch, { sleeps: [] }).complete({ system: "s", user: "u", schema: S })).rejects.toMatchObject({ kind: "quota" });
  });

  it("maps subscription usage-limit events to quota and a missing completed event to an error", async () => {
    await login();
    const limited = fakeFetch(route(() => sse({ type: "response.failed", response: { error: { code: "subscription_sharing_usage_limit_exceeded", message: "limit" } } })));
    await expect(make(limited.fetch).complete({ system: "s", user: "u", schema: S })).rejects.toMatchObject({ kind: "quota" });
    const cut = fakeFetch(route(() => sse(delta('{"n":'))));
    await expect(make(cut.fetch).complete({ system: "s", user: "u", schema: S })).rejects.toMatchObject({ kind: "internal" });
  });

  it("fails with invalid_output when the streamed text is not the expected json", async () => {
    await login();
    const { fetch } = fakeFetch(route(() => sse(delta("그냥 글"), completed)));
    await expect(make(fetch).complete({ system: "s", user: "u", schema: S })).rejects.toMatchObject({ kind: "invalid_output" });
  });

  it("requires a login", async () => {
    await expect(make(fakeFetch(() => jsonRes({})).fetch).complete({ system: "s", user: "u", schema: S })).rejects.toMatchObject({ kind: "auth" });
  });
});
