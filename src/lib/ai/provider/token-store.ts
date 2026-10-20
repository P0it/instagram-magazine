import "server-only";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { isLocalDev, resetEnvCache } from "@/lib/env";
import { upsertEnvLine } from "@/lib/google/local-env";
import type { AiProviderId } from "@/types";
import { AiError } from "./types";

/**
 * AI 제공자 로그인 토큰. 메모리 캐시가 1차 출처이고 .env.local 은 재시작을 위한 보관용이다.
 * 쓰기는 단일 잠금 안에서만 하고, 파일 쓰기가 성공한 뒤에만 캐시를 바꾼다.
 * 토큰은 Drive·로그·브라우저로 나가지 않는다.
 */
const AiTokensSchema = z.object({
  access: z.string().min(1),
  refresh: z.string().min(1),
  expires_at: z.string(),
  account: z.string().optional(),
});
export type AiTokens = z.infer<typeof AiTokensSchema>;

const ENV_KEY: Record<AiProviderId, string> = { claude: "AI_CLAUDE_TOKENS", chatgpt: "AI_CHATGPT_TOKENS" };
const defaultFile = () => path.join(process.cwd(), ".env.local");

/** `.env.local` 한 줄에 안전하게 들어가도록 JSON 을 base64url 로 감싼다 (`#`·따옴표 문제 회피) */
export function encodeTokenEnv(t: AiTokens): string {
  return Buffer.from(JSON.stringify(t), "utf8").toString("base64url");
}

export function parseTokenEnv(raw: string): AiTokens | null {
  if (!raw) return null;
  try {
    const parsed = AiTokensSchema.safeParse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const cache = new Map<AiProviderId, AiTokens | null>();
let lock: Promise<unknown> = Promise.resolve();

export function resetTokenCacheForTests(): void {
  cache.clear();
  lock = Promise.resolve();
}

export function getTokens(id: AiProviderId): AiTokens | null {
  if (!cache.has(id)) cache.set(id, parseTokenEnv(process.env[ENV_KEY[id]] ?? ""));
  return cache.get(id) ?? null;
}

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn);
  lock = run.catch(() => undefined);
  return run;
}

async function writeEnvValue(id: AiProviderId, value: string, file: string): Promise<void> {
  if (!isLocalDev()) throw new AiError("auth", "배포 환경에서는 로그인 토큰을 저장할 수 없어요");
  try {
    let content = "";
    try {
      content = await readFile(file, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    await writeFile(file, upsertEnvLine(content, ENV_KEY[id], value), "utf8");
  } catch (e) {
    throw new AiError("auth", `로그인 토큰을 .env.local 에 저장하지 못했어요: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function setTokens(id: AiProviderId, t: AiTokens, file = defaultFile()): Promise<void> {
  return serialized(async () => {
    const value = encodeTokenEnv(AiTokensSchema.parse(t));
    await writeEnvValue(id, value, file);
    cache.set(id, t);
    process.env[ENV_KEY[id]] = value;
    resetEnvCache();
  });
}

export function clearTokens(id: AiProviderId, file = defaultFile()): Promise<void> {
  return serialized(async () => {
    await writeEnvValue(id, "", file);
    cache.set(id, null);
    delete process.env[ENV_KEY[id]];
    resetEnvCache();
  });
}
