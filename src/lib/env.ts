import "server-only";
import { z } from "zod";

const EnvSchema = z.object({
  APP_BASE_URL: z.string().default("http://localhost:3000"),
  APP_ACCESS_KEY: z.string().default(""),
  APP_ENCRYPTION_KEY: z.string().default(""),
  CRON_SECRET: z.string().default(""),
  DRIVE_CLIENT: z.enum(["mock", "google"]).default("mock"),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().default(""),
  GOOGLE_DRIVE_ROOT_FOLDER_ID: z.string().default(""),
  GOOGLE_OAUTH_CLIENT_ID: z.string().default(""),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().default(""),
  GOOGLE_REFRESH_TOKEN: z.string().default(""),
  META_APP_ID: z.string().default(""),
  META_APP_SECRET: z.string().default(""),
  META_REDIRECT_URI: z.string().default(""),
});
export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  cached = EnvSchema.parse({
    APP_BASE_URL: process.env.APP_BASE_URL || undefined,
    APP_ACCESS_KEY: process.env.APP_ACCESS_KEY,
    APP_ENCRYPTION_KEY: process.env.APP_ENCRYPTION_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    DRIVE_CLIENT: process.env.DRIVE_CLIENT || undefined,
    GOOGLE_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    GOOGLE_DRIVE_ROOT_FOLDER_ID: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID,
    GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN,
    META_APP_ID: process.env.META_APP_ID,
    META_APP_SECRET: process.env.META_APP_SECRET,
    META_REDIRECT_URI: process.env.META_REDIRECT_URI,
  });
  return cached;
}

/** 32바이트 키. 미설정이면 개발용 고정 키(경고 로그) — 운영에서는 반드시 설정. */
export function encryptionKey(): Buffer {
  const raw = env().APP_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("APP_ENCRYPTION_KEY is required in production");
    }
    return Buffer.alloc(32, 7);
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be 32 bytes base64");
  return buf;
}

/** Google OAuth 클라이언트(앱 등록)가 있는가 — 있어야 "Google 계정으로 연결" 버튼이 산다 */
export function isGoogleOauthConfigured(): boolean {
  const e = env();
  return Boolean(e.GOOGLE_OAUTH_CLIENT_ID && e.GOOGLE_OAUTH_CLIENT_SECRET);
}

/** Google 리디렉션 URI 는 APP_BASE_URL 에서 파생 — Google Cloud 콘솔에 이 값을 등록한다 */
export function googleRedirectUri(): string {
  return `${env().APP_BASE_URL.replace(/\/$/, "")}/api/google/oauth/callback`;
}

/**
 * Google Drive 인증 방식.
 *  - oauth: GOOGLE_REFRESH_TOKEN (+ 클라이언트 id/secret) — 사용자 본인 Drive
 *  - service_account: GOOGLE_SERVICE_ACCOUNT_JSON + GOOGLE_DRIVE_ROOT_FOLDER_ID
 *  - none: 자격증명 없음
 */
export type GoogleAuthMode = "oauth" | "service_account" | "none";
export function googleAuthMode(e: Env = env()): GoogleAuthMode {
  if (e.GOOGLE_REFRESH_TOKEN && e.GOOGLE_OAUTH_CLIENT_ID && e.GOOGLE_OAUTH_CLIENT_SECRET) return "oauth";
  if (e.GOOGLE_SERVICE_ACCOUNT_JSON) return "service_account";
  return "none";
}

export function isOauthConfigured(): boolean {
  const e = env();
  return Boolean(e.META_APP_ID && e.META_APP_SECRET && e.META_REDIRECT_URI);
}
