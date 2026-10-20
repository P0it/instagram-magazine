import "server-only";
import { z } from "zod";
import type { AiProviderStatus } from "@/types";
import { CHATGPT } from "./chatgpt-oauth";
import { parseJsonReply } from "./json-reply";
import { getTokens, setTokens, type AiTokens } from "./token-store";
import { AiError, type AiProvider, type AiRequest } from "./types";

/**
 * ChatGPT 구독으로 OpenAI Responses API 를 호출하는 제공자.
 * 계약: store:false · stream:true 필수, 지원하지 않는 필드(temperature 등) 금지, ChatGPT backend-api 는 쓰지 않는다.
 * 출처: https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
 */
const RESPONSES_URL = "https://api.openai.com/v1/responses";
const MODELS_URL = "https://api.openai.com/v1/models";
const REFRESH_MARGIN_MS = 60_000;
const MAX_RETRIES = 3;
const RELOGIN = "ChatGPT 로그인이 만료됐어요. 설정 > AI 에서 다시 로그인해 주세요.";

const RefreshResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  id_token: z.string().min(1).optional(),
  expires_in: z.number().positive(),
});
const ModelsSchema = z.object({ models: z.array(z.object({ slug: z.string(), visibility: z.string().optional() })) });

export interface ChatgptDeps {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** 갱신된 토큰을 쓸 .env.local (테스트용) */
  envFile?: string;
}

export function createChatgptProvider(deps: ChatgptDeps = {}): AiProvider {
  const fetchFn = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let refreshing: Promise<AiTokens> | null = null;
  let model: string | null = null;

  /** 갱신은 한 번에 하나만 — refresh token 이 갱신마다 바뀌므로 동시에 두 번 돌리면 하나가 무효가 된다 */
  function refresh(current: AiTokens): Promise<AiTokens> {
    refreshing ??= (async () => {
      if (!current.client_id) throw new AiError("auth", RELOGIN);
      const res = await fetchFn(CHATGPT.tokenUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: current.refresh, client_id: current.client_id, resource: CHATGPT.resource }).toString(),
      });
      if (!res.ok) throw new AiError("auth", RELOGIN);
      const parsed = RefreshResponseSchema.safeParse(await res.json().catch(() => null));
      if (!parsed.success) throw new AiError("auth", RELOGIN);
      const next: AiTokens = {
        ...current,
        access: parsed.data.access_token,
        refresh: parsed.data.refresh_token ?? current.refresh,
        id_token: parsed.data.id_token ?? current.id_token,
        expires_at: new Date(now() + parsed.data.expires_in * 1000).toISOString(),
      };
      await setTokens("chatgpt", next, deps.envFile);
      return next;
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function freshTokens(force = false): Promise<AiTokens> {
    const t = getTokens("chatgpt");
    if (!t) throw new AiError("auth", "ChatGPT 에 로그인되어 있지 않아요. 설정 > AI 에서 로그인해 주세요.");
    if (force || Date.parse(t.expires_at) - now() < REFRESH_MARGIN_MS) return refresh(t);
    return t;
  }

  async function pickModel(access: string): Promise<string> {
    if (process.env.AI_CHATGPT_MODEL) return process.env.AI_CHATGPT_MODEL;
    if (model) return model;
    const res = await fetchFn(MODELS_URL, { headers: { authorization: `Bearer ${access}` } });
    const parsed = ModelsSchema.safeParse(await res.json().catch(() => null));
    const listed = parsed.success ? parsed.data.models.find((m) => m.visibility === "list") : undefined;
    if (!res.ok || !listed) throw new AiError("internal", "ChatGPT 모델 목록을 읽지 못했어요");
    return (model = listed.slug);
  }

  async function status(): Promise<AiProviderStatus> {
    const t = getTokens("chatgpt");
    const base = { id: "chatgpt" as const, kind: "oauth" as const, supports_images: true };
    if (!t) return { ...base, connected: false };
    return { ...base, connected: true, expires_at: t.expires_at, ...(t.account ? { account: t.account } : {}) };
  }

  async function complete<S extends z.ZodTypeAny>(req: AiRequest<S>): Promise<z.output<S>> {
    let tokens = await freshTokens();
    const slug = await pickModel(tokens.access);
    const content: unknown[] = [{ type: "input_text", text: req.user }];
    for (const img of req.images ?? []) content.push({ type: "input_image", image_url: `data:${img.mime};base64,${Buffer.from(img.bytes).toString("base64")}` });
    const body = JSON.stringify({ model: slug, instructions: req.system, input: [{ role: "user", content }], store: false, stream: true });

    let refreshedOn401 = false;
    for (let attempt = 0; ; attempt++) {
      const res = await fetchFn(RESPONSES_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${tokens.access}`, "content-type": "application/json", accept: "text/event-stream" },
        body,
        signal: req.signal,
      });
      if (res.status === 401) {
        if (refreshedOn401) throw new AiError("auth", RELOGIN);
        refreshedOn401 = true;
        tokens = await freshTokens(true);
        attempt--;
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= MAX_RETRIES) {
          throw res.status === 429 ? new AiError("quota", "ChatGPT 요청이 너무 많거나 사용 한도에 도달했어요") : new AiError("internal", `ChatGPT 서버 오류 (${res.status})`);
        }
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (!res.ok) throw new AiError("internal", `ChatGPT 요청이 거부됐어요 (${res.status}): ${(await res.text()).slice(0, 200)}`);
      return parseJsonReply(req.schema, readStream(await res.text()));
    }
  }

  return { id: "chatgpt", kind: "oauth", supportsImages: true, status, complete };
}

/** SSE 본문에서 출력 텍스트를 모은다. 완료 이벤트가 없거나 실패 이벤트가 있으면 오류. */
function readStream(raw: string): string {
  let text = "";
  let completed = false;
  for (const block of raw.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .join("");
    if (!data || data === "[DONE]") continue;
    let event: { type?: string; delta?: string; response?: { error?: { code?: string; message?: string } }; error?: { code?: string; message?: string } };
    try {
      event = JSON.parse(data);
    } catch {
      continue;
    }
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") text += event.delta;
    else if (event.type === "response.completed") completed = true;
    else if (event.type === "response.failed" || event.type === "response.incomplete") {
      const err = event.response?.error ?? event.error;
      if (err?.code?.startsWith("subscription_sharing_usage")) throw new AiError("quota", "ChatGPT 구독 사용 한도에 도달했어요");
      throw new AiError("internal", `ChatGPT 응답 실패${err?.code ? ` (${err.code})` : ""}: ${(err?.message ?? event.type).slice(0, 200)}`);
    }
  }
  if (!completed) throw new AiError("internal", "ChatGPT 응답이 중간에 끊겼어요");
  return text;
}
