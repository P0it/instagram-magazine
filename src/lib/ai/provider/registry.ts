import "server-only";
import { aiClientMode, env } from "@/lib/env";
import { MockAiProvider } from "@/mocks/ai/MockAiProvider";
import type { AiProviderId, AiProviderStatus } from "@/types";
import { createChatgptProvider } from "./chatgpt";
import { createClaudeCliProvider } from "./cli";
import { persistEnvVar } from "./env-file";
import { AiError, type AiProvider } from "./types";

let override: AiProvider[] | null = null;
let built: AiProvider[] | null = null;

/** 실제 제공자: Claude 는 로그인된 CLI, ChatGPT 는 앱이 받은 OAuth 토큰 */
function buildRealProviders(): AiProvider[] {
  return [createClaudeCliProvider(), createChatgptProvider()];
}

function providers(): AiProvider[] {
  if (override) return override;
  if (!built) built = aiClientMode() === "mock" ? [new MockAiProvider({ id: "claude" })] : buildRealProviders();
  return built;
}

/** 테스트·Mock 모드에서 제공자 목록을 직접 정한다 */
export function setProviders(list: AiProvider[]): void {
  override = list;
}

export function resetProviders(): void {
  override = null;
  built = null;
}

export async function listProviderStatus(): Promise<AiProviderStatus[]> {
  return Promise.all(providers().map((p) => p.status()));
}

export function defaultProviderId(): AiProviderId | null {
  return env().AI_DEFAULT_PROVIDER ?? null;
}

/**
 * 호출할 제공자. 요청한 것 → 설정 기본값 → 연결된 첫 제공자 순.
 * 연결된 것이 없으면 auth 오류.
 */
export async function getProvider(preferred?: AiProviderId): Promise<AiProvider> {
  const list = providers();
  const statuses = await Promise.all(list.map((p) => p.status()));
  const connected = list.filter((_, i) => statuses[i]!.connected);
  const wanted = [preferred, defaultProviderId()].filter((x): x is AiProviderId => Boolean(x));
  for (const id of wanted) {
    const hit = connected.find((p) => p.id === id);
    if (hit) return hit;
  }
  const first = connected[0];
  if (!first) throw new AiError("auth", "AI 로그인이 필요해요. 설정 > AI 에서 로그인해 주세요.");
  return first;
}

/** 이 맥의 기본 제공자를 .env.local 에 저장한다 (Drive 에는 두지 않는다) */
export function setDefaultProvider(id: AiProviderId, file?: string): Promise<void> {
  return persistEnvVar("AI_DEFAULT_PROVIDER", id, file);
}
