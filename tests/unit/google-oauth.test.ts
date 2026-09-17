import { describe, expect, it, vi } from "vitest";
import { buildGoogleAuthUrl, exchangeGoogleCode, fetchGoogleEmail, GoogleOauthError } from "@/lib/google/oauth";
import { googleAuthMode, type Env } from "@/lib/env";

const baseEnv: Env = {
  APP_BASE_URL: "https://desk.example.com",
  APP_ACCESS_KEY: "",
  APP_ENCRYPTION_KEY: "",
  CRON_SECRET: "",
  DRIVE_CLIENT: "google",
  GOOGLE_SERVICE_ACCOUNT_JSON: "",
  GOOGLE_DRIVE_ROOT_FOLDER_ID: "",
  GOOGLE_OAUTH_CLIENT_ID: "",
  GOOGLE_OAUTH_CLIENT_SECRET: "",
  GOOGLE_REFRESH_TOKEN: "",
  META_APP_ID: "",
  META_APP_SECRET: "",
  META_REDIRECT_URI: "",
};

const jsonRes = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

describe("googleAuthMode", () => {
  it("prefers OAuth when refresh token + client are present, else service account, else none", () => {
    expect(googleAuthMode(baseEnv)).toBe("none");
    expect(googleAuthMode({ ...baseEnv, GOOGLE_SERVICE_ACCOUNT_JSON: "e30=" })).toBe("service_account");
    expect(googleAuthMode({ ...baseEnv, GOOGLE_SERVICE_ACCOUNT_JSON: "e30=", GOOGLE_OAUTH_CLIENT_ID: "id", GOOGLE_OAUTH_CLIENT_SECRET: "s", GOOGLE_REFRESH_TOKEN: "r" })).toBe("oauth");
    // 토큰만 있고 클라이언트가 없으면 OAuth 로 못 쓴다
    expect(googleAuthMode({ ...baseEnv, GOOGLE_REFRESH_TOKEN: "r" })).toBe("none");
  });
});

describe("Google OAuth helpers", () => {
  it("auth url asks for offline access, consent and the full drive scope", () => {
    const u = new URL(buildGoogleAuthUrl("cid", "https://desk.example.com/api/google/oauth/callback", "st"));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
    expect(u.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/drive");
    expect(u.searchParams.get("state")).toBe("st");
    expect(u.searchParams.get("redirect_uri")).toBe("https://desk.example.com/api/google/oauth/callback");
  });

  it("exchanges the code and returns the refresh token", async () => {
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://oauth2.googleapis.com/token");
      const body = init?.body as URLSearchParams;
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("code")).toBe("c0de");
      return jsonRes(200, { access_token: "at", refresh_token: "rt", scope: "https://www.googleapis.com/auth/drive openid" });
    });
    const r = await exchangeGoogleCode({ clientId: "id", clientSecret: "s", redirectUri: "https://x/cb", code: "c0de" }, f as unknown as typeof fetch);
    expect(r).toEqual({ access_token: "at", refresh_token: "rt", scope: "https://www.googleapis.com/auth/drive openid" });
  });

  it("fails clearly when Google omits the refresh token or the drive scope", async () => {
    const noRefresh = vi.fn(async () => jsonRes(200, { access_token: "at", scope: "https://www.googleapis.com/auth/drive" }));
    await expect(exchangeGoogleCode({ clientId: "id", clientSecret: "s", redirectUri: "u", code: "c" }, noRefresh as unknown as typeof fetch)).rejects.toBeInstanceOf(GoogleOauthError);
    const noDrive = vi.fn(async () => jsonRes(200, { access_token: "at", refresh_token: "rt", scope: "openid email" }));
    await expect(exchangeGoogleCode({ clientId: "id", clientSecret: "s", redirectUri: "u", code: "c" }, noDrive as unknown as typeof fetch)).rejects.toThrow(/Drive 권한/);
    const denied = vi.fn(async () => jsonRes(400, { error: "invalid_grant", error_description: "Bad code" }));
    await expect(exchangeGoogleCode({ clientId: "id", clientSecret: "s", redirectUri: "u", code: "c" }, denied as unknown as typeof fetch)).rejects.toThrow(/Bad code/);
  });

  it("reads the email from userinfo, null on failure", async () => {
    const ok = vi.fn(async () => jsonRes(200, { email: "me@example.com" }));
    expect(await fetchGoogleEmail("at", ok as unknown as typeof fetch)).toBe("me@example.com");
    const bad = vi.fn(async () => jsonRes(401, {}));
    expect(await fetchGoogleEmail("at", bad as unknown as typeof fetch)).toBeNull();
  });
});

describe("upsertEnvLine", () => {
  it("replaces an existing line or appends a new one", async () => {
    const { upsertEnvLine } = await import("@/lib/google/local-env");
    expect(upsertEnvLine("A=1\nGOOGLE_REFRESH_TOKEN=\nB=2\n", "GOOGLE_REFRESH_TOKEN", "tok")).toBe("A=1\nGOOGLE_REFRESH_TOKEN=tok\nB=2\n");
    expect(upsertEnvLine("A=1", "GOOGLE_REFRESH_TOKEN", "tok")).toBe("A=1\nGOOGLE_REFRESH_TOKEN=tok\n");
    expect(upsertEnvLine("", "GOOGLE_REFRESH_TOKEN", "tok")).toBe("GOOGLE_REFRESH_TOKEN=tok\n");
  });
});
