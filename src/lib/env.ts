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

export function isOauthConfigured(): boolean {
  const e = env();
  return Boolean(e.META_APP_ID && e.META_APP_SECRET && e.META_REDIRECT_URI);
}
