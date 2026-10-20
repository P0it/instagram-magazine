import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "@/lib/env";
import { persistEnvVar } from "./env-file";
import { verifyIdToken, type Jwks } from "./jwt";
import { makePkce } from "./pkce";
import { getTokens, setTokens } from "./token-store";
import { AiError } from "./types";

/**
 * "Sign in with ChatGPT" (로컬·오픈소스 앱용) 로그인.
 * 계약 출처: https://developers.openai.com/siwc/token-sharing-open-source/sign-in
 * 조사 노트: docs/superpowers/notes/2026-10-21-ai-provider-spike.md
 */
export const CHATGPT = {
  authorizeUrl: "https://auth.openai.com/api/accounts/authorize",
  tokenUrl: "https://auth.openai.com/api/accounts/oauth/token",
  issuer: "https://auth.openai.com",
  resource: "https://api.openai.com/v1",
  scope: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
  planScope: "chatgpt.tokens.use.direct",
  registrationClientId: "dynamic_agent_client",
  agentName: "Magazine Desk",
  callbackPath: "/api/ai/oauth/chatgpt/callback",
} as const;

const PENDING_TTL_MS = 10 * 60_000;

interface Pending {
  verifier: string;
  nonce: string;
  /** 재인증이면 저장돼 있던 발급 client_id */
  clientId?: string;
  createdAt: number;
}
const g = globalThis as typeof globalThis & { __magazineDeskAiPending?: Map<string, Pending> };
/**
 * 콜백은 `127.0.0.1` 로 돌아오고 앱은 보통 localhost 에서 열려 있어 쿠키가 같이 오지 않는다.
 * 그래서 PKCE·state·nonce 는 서버 메모리에 둔다 (이 PC 한 사람용 앱).
 */
const pendingMap = () => (g.__magazineDeskAiPending ??= new Map());

export function resetPendingLoginsForTests(): void {
  pendingMap().clear();
}

/** 루프백 리디렉션 URI — 호스트는 반드시 127.0.0.1, 포트는 앱 포트 */
export function chatgptRedirectUri(base = env().APP_BASE_URL): string {
  const port = new URL(base).port || "3000";
  return `http://127.0.0.1:${port}${CHATGPT.callbackPath}`;
}

interface LoginDeps {
  fetch?: typeof fetch;
  now?: () => number;
  envFile?: string;
}

/** 이 호스트의 고유 값. 한 번 만들어 .env.local 에 저장하고 계속 쓴다 */
async function hostId(envFile?: string): Promise<string> {
  const existing = process.env.AI_CHATGPT_HOST_ID;
  if (existing) return existing;
  const id = `urn:uuid:${randomUUID()}`;
  await persistEnvVar("AI_CHATGPT_HOST_ID", id, envFile);
  return id;
}

/** 브라우저를 보낼 인가 URL 을 만든다 */
export async function startChatgptLogin(deps: LoginDeps = {}): Promise<string> {
  const now = (deps.now ?? Date.now)();
  const saved = getTokens("chatgpt");
  const pkce = makePkce();
  const map = pendingMap();
  for (const [state, p] of map) if (now - p.createdAt > PENDING_TTL_MS) map.delete(state);
  map.set(pkce.state, { verifier: pkce.verifier, nonce: pkce.nonce, clientId: saved?.client_id, createdAt: now });

  const q = new URLSearchParams({
    client_id: saved?.client_id ?? CHATGPT.registrationClientId,
    ...(saved?.client_id ? {} : { agent_name_hint: CHATGPT.agentName }),
    ext_agent_host_id: await hostId(deps.envFile),
    ...(saved?.id_token ? { id_token_hint: saved.id_token } : {}),
    response_type: "code",
    redirect_uri: chatgptRedirectUri(),
    scope: CHATGPT.scope,
    resource: CHATGPT.resource,
    state: pkce.state,
    nonce: pkce.nonce,
    code_challenge_method: "S256",
    code_challenge: pkce.challenge,
  });
  return `${CHATGPT.authorizeUrl}?${q.toString()}`;
}

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  id_token: z.string().min(1),
  expires_in: z.number().positive(),
  scope: z.string().optional(),
});

async function fetchJwks(fetchFn: typeof fetch): Promise<Jwks> {
  try {
    const conf = z.object({ jwks_uri: z.string().url() }).parse(await (await fetchFn(`${CHATGPT.issuer}/.well-known/openid-configuration`)).json());
    return (await (await fetchFn(conf.jwks_uri)).json()) as Jwks;
  } catch {
    throw new AiError("auth", "ID 토큰 검증 키를 가져오지 못해 로그인을 끝낼 수 없어요");
  }
}

/** 콜백 처리: state 확인 → 코드 교환 → 구독 권한·ID 토큰 검증 → 토큰 저장 */
export async function completeChatgptLogin(
  q: { code?: string | null; state?: string | null; error?: string | null; client_id?: string | null; scope?: string | null },
  deps: LoginDeps = {},
): Promise<void> {
  const now = (deps.now ?? Date.now)();
  const fetchFn = deps.fetch ?? fetch;
  const map = pendingMap();
  const pending = q.state ? map.get(q.state) : undefined;
  if (!pending || now - pending.createdAt > PENDING_TTL_MS) throw new AiError("auth", "로그인 요청이 만료됐거나 맞지 않아요. 다시 시도해 주세요.");
  map.delete(q.state!);

  if (q.error) throw new AiError("auth", q.error === "access_denied" ? "로그인이 거부됐어요 (access_denied)" : `로그인에 실패했어요 (${q.error})`);
  if (!q.code) throw new AiError("auth", "로그인 응답에 인증 코드가 없어요");

  let clientId: string;
  if (pending.clientId) {
    if (q.client_id && q.client_id !== pending.clientId) throw new AiError("auth", "로그인 응답의 client_id 가 저장된 값과 달라요");
    clientId = pending.clientId;
  } else {
    if (!q.client_id) throw new AiError("auth", "ChatGPT 앱 등록이 끝나지 않았어요 (client_id 없음)");
    clientId = q.client_id;
  }

  const res = await fetchFn(CHATGPT.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, code: q.code, code_verifier: pending.verifier, redirect_uri: chatgptRedirectUri(), resource: CHATGPT.resource }).toString(),
  });
  if (!res.ok) throw new AiError("auth", `토큰 교환에 실패했어요 (${res.status})`);
  const parsed = TokenResponseSchema.safeParse(await res.json());
  if (!parsed.success) throw new AiError("auth", "토큰 응답이 올바르지 않아요");
  const t = parsed.data;
  if (!t.refresh_token) throw new AiError("auth", "토큰 응답에 refresh token 이 없어요 (offline_access 필요)");

  const granted = (t.scope ?? q.scope ?? "").split(/\s+/);
  if (!granted.includes(CHATGPT.planScope)) throw new AiError("auth", `ChatGPT 구독 사용 권한(${CHATGPT.planScope})이 허용되지 않았어요. 권한을 허용해 다시 로그인해 주세요.`);

  const claims = verifyIdToken(t.id_token, await fetchJwks(fetchFn), { issuer: CHATGPT.issuer, audience: clientId, nonce: pending.nonce, now });

  await setTokens(
    "chatgpt",
    { access: t.access_token, refresh: t.refresh_token, expires_at: new Date(now + t.expires_in * 1000).toISOString(), account: claims.email ?? claims.sub, client_id: clientId, id_token: t.id_token },
    deps.envFile,
  );
}
