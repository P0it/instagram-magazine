import "server-only";
import { z } from "zod";
import type { AiProviderId } from "@/types";
import { persistEnvVar, defaultEnvFile } from "./env-file";

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
  /** ChatGPT: 첫 등록에서 발급된 `oaiapp_…`. 이후 요청·재인증에 쓴다 */
  client_id: z.string().optional(),
  /** ChatGPT: 직전 ID 토큰. 재인증 때 id_token_hint 로 보낸다 */
  id_token: z.string().optional(),
});
export type AiTokens = z.infer<typeof AiTokensSchema>;

const ENV_KEY: Record<AiProviderId, string> = { claude: "AI_CLAUDE_TOKENS", chatgpt: "AI_CHATGPT_TOKENS" };

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

export function setTokens(id: AiProviderId, t: AiTokens, file = defaultEnvFile()): Promise<void> {
  return serialized(async () => {
    await persistEnvVar(ENV_KEY[id], encodeTokenEnv(AiTokensSchema.parse(t)), file);
    cache.set(id, t);
  });
}

export function clearTokens(id: AiProviderId, file = defaultEnvFile()): Promise<void> {
  return serialized(async () => {
    await persistEnvVar(ENV_KEY[id], "", file);
    cache.set(id, null);
  });
}
