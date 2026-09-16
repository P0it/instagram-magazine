import "server-only";
import { z } from "zod";

/**
 * Instagram API with Instagram Login (Graph API) 최소 래퍼.
 * 문서: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
 * 모든 호출은 fetch 주입 가능(테스트).
 */
export const IG_GRAPH_BASE = "https://graph.instagram.com";
export const IG_GRAPH_VERSION = "v23.0";
export const IG_OAUTH_AUTHORIZE = "https://www.instagram.com/oauth/authorize";
export const IG_OAUTH_TOKEN = "https://api.instagram.com/oauth/access_token";

export const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_insights",
];

type Fetch = typeof fetch;

export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly subcode?: number,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "InstagramApiError";
  }
}

const ErrorBodySchema = z.object({
  error: z
    .object({
      message: z.string().optional(),
      code: z.number().optional(),
      error_subcode: z.number().optional(),
      error_user_msg: z.string().optional(),
    })
    .optional(),
  error_message: z.string().optional(),
  error_type: z.string().optional(),
});

async function parseJson<S extends z.ZodTypeAny>(res: Response, schema: S): Promise<z.output<S>> {
  const text = await res.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new InstagramApiError(`Non-JSON response (${res.status}): ${text.slice(0, 200)}`, undefined, undefined, res.status);
  }
  if (!res.ok) {
    const err = ErrorBodySchema.safeParse(body);
    const e = err.success ? err.data : undefined;
    const msg = e?.error?.error_user_msg ?? e?.error?.message ?? e?.error_message ?? `HTTP ${res.status}`;
    throw new InstagramApiError(`IG API error: ${msg}`, e?.error?.code, e?.error?.error_subcode, res.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new InstagramApiError(`Unexpected IG response shape: ${parsed.error.message}`);
  return parsed.data;
}

function graphUrl(path: string, params: Record<string, string | undefined>): string {
  const u = new URL(`${IG_GRAPH_BASE}/${IG_GRAPH_VERSION}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v);
  return u.toString();
}

// ---------- OAuth ----------

export function buildAuthUrl(appId: string, redirectUri: string, state: string): string {
  const u = new URL(IG_OAUTH_AUTHORIZE);
  u.searchParams.set("client_id", appId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", IG_SCOPES.join(","));
  u.searchParams.set("state", state);
  return u.toString();
}

const ShortTokenSchema = z.object({
  access_token: z.string(),
  user_id: z.union([z.string(), z.number()]).transform(String),
  permissions: z.union([z.string(), z.array(z.string())]).optional(),
});

export async function exchangeCode(
  opts: { appId: string; appSecret: string; redirectUri: string; code: string },
  f: Fetch = fetch,
): Promise<{ access_token: string; user_id: string }> {
  const body = new URLSearchParams({
    client_id: opts.appId,
    client_secret: opts.appSecret,
    grant_type: "authorization_code",
    redirect_uri: opts.redirectUri,
    code: opts.code,
  });
  const res = await f(IG_OAUTH_TOKEN, { method: "POST", body });
  const data = await parseJson(res, ShortTokenSchema);
  return { access_token: data.access_token, user_id: data.user_id };
}

const LongTokenSchema = z.object({
  access_token: z.string(),
  token_type: z.string().optional(),
  expires_in: z.number(),
});

export async function getLongLivedToken(
  opts: { appSecret: string; shortToken: string },
  f: Fetch = fetch,
): Promise<{ access_token: string; expires_in: number }> {
  const u = new URL(`${IG_GRAPH_BASE}/access_token`);
  u.searchParams.set("grant_type", "ig_exchange_token");
  u.searchParams.set("client_secret", opts.appSecret);
  u.searchParams.set("access_token", opts.shortToken);
  const res = await f(u.toString());
  return parseJson(res, LongTokenSchema);
}

export async function refreshLongLivedToken(
  token: string,
  f: Fetch = fetch,
): Promise<{ access_token: string; expires_in: number }> {
  const u = new URL(`${IG_GRAPH_BASE}/refresh_access_token`);
  u.searchParams.set("grant_type", "ig_refresh_token");
  u.searchParams.set("access_token", token);
  const res = await f(u.toString());
  return parseJson(res, LongTokenSchema);
}

// ---------- Profile ----------

const MeSchema = z.object({
  id: z.string(),
  user_id: z.union([z.string(), z.number()]).transform(String).optional(),
  username: z.string(),
});

export async function getMe(token: string, f: Fetch = fetch): Promise<{ id: string; user_id: string; username: string }> {
  const res = await f(graphUrl("me", { fields: "id,user_id,username", access_token: token }));
  const data = await parseJson(res, MeSchema);
  return { id: data.id, user_id: data.user_id ?? data.id, username: data.username };
}

// ---------- Publishing ----------

const IdSchema = z.object({ id: z.string() });

export async function createImageContainer(
  opts: { igUserId: string; token: string; imageUrl: string; caption?: string; altText?: string; isCarouselItem?: boolean },
  f: Fetch = fetch,
): Promise<string> {
  const params: Record<string, string | undefined> = {
    image_url: opts.imageUrl,
    access_token: opts.token,
  };
  if (opts.isCarouselItem) params.is_carousel_item = "true";
  else {
    params.caption = opts.caption ?? "";
    if (opts.altText) params.alt_text = opts.altText;
  }
  const res = await f(graphUrl(`${opts.igUserId}/media`, params), { method: "POST" });
  return (await parseJson(res, IdSchema)).id;
}

export async function createCarouselContainer(
  opts: { igUserId: string; token: string; children: string[]; caption: string },
  f: Fetch = fetch,
): Promise<string> {
  const res = await f(
    graphUrl(`${opts.igUserId}/media`, {
      media_type: "CAROUSEL",
      children: opts.children.join(","),
      caption: opts.caption,
      access_token: opts.token,
    }),
    { method: "POST" },
  );
  return (await parseJson(res, IdSchema)).id;
}

const StatusSchema = z.object({
  status_code: z.enum(["EXPIRED", "ERROR", "FINISHED", "IN_PROGRESS", "PUBLISHED"]).optional(),
  status: z.string().optional(),
  id: z.string().optional(),
});
export type ContainerStatus = z.infer<typeof StatusSchema>;

export async function getContainerStatus(creationId: string, token: string, f: Fetch = fetch): Promise<ContainerStatus> {
  const res = await f(graphUrl(creationId, { fields: "status_code,status", access_token: token }));
  return parseJson(res, StatusSchema);
}

export async function waitForContainer(
  creationId: string,
  token: string,
  opts: { timeoutMs?: number; intervalMs?: number; sleep?: (ms: number) => Promise<void> } = {},
  f: Fetch = fetch,
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const intervalMs = opts.intervalMs ?? 2_000;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const started = Date.now();
  for (;;) {
    const s = await getContainerStatus(creationId, token, f);
    if (s.status_code === "FINISHED" || s.status_code === "PUBLISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") {
      throw new InstagramApiError(`Container ${creationId} ${s.status_code}: ${s.status ?? ""}`);
    }
    if (Date.now() - started > timeoutMs) throw new InstagramApiError(`Container ${creationId} not finished within ${timeoutMs}ms`);
    await sleep(intervalMs);
  }
}

export async function publishMedia(
  opts: { igUserId: string; token: string; creationId: string },
  f: Fetch = fetch,
): Promise<string> {
  const res = await f(
    graphUrl(`${opts.igUserId}/media_publish`, { creation_id: opts.creationId, access_token: opts.token }),
    { method: "POST" },
  );
  return (await parseJson(res, IdSchema)).id;
}

const LimitSchema = z.object({
  data: z.array(z.object({ quota_usage: z.number(), config: z.object({ quota_total: z.number() }).optional() })),
});

export async function getPublishingLimit(
  igUserId: string,
  token: string,
  f: Fetch = fetch,
): Promise<{ used: number; total: number } | null> {
  try {
    const res = await f(graphUrl(`${igUserId}/content_publishing_limit`, { fields: "quota_usage,config", access_token: token }));
    const d = await parseJson(res, LimitSchema);
    const row = d.data[0];
    if (!row) return null;
    return { used: row.quota_usage, total: row.config?.quota_total ?? 100 };
  } catch {
    return null;
  }
}

// ---------- Insights ----------

const InsightValueSchema = z.object({
  name: z.string(),
  period: z.string().optional(),
  values: z.array(z.object({ value: z.number().optional(), end_time: z.string().optional() })).optional(),
  total_value: z.object({ value: z.number().optional() }).optional(),
});
const InsightListSchema = z.object({ data: z.array(InsightValueSchema).default([]) });

function pickMetric(list: z.infer<typeof InsightListSchema>, name: string): number {
  const row = list.data.find((d) => d.name === name);
  if (!row) return 0;
  if (row.total_value?.value !== undefined) return row.total_value.value;
  const vals = row.values ?? [];
  return vals[vals.length - 1]?.value ?? 0;
}

const ProfileCountsSchema = z.object({
  followers_count: z.number().optional(),
  media_count: z.number().optional(),
});

/** GET /{ig-user-id}?fields=followers_count,media_count */
export async function getProfileCounts(igUserId: string, token: string, f: Fetch = fetch): Promise<{ followers: number; media: number }> {
  const res = await f(graphUrl(igUserId, { fields: "followers_count,media_count", access_token: token }));
  const d = await parseJson(res, ProfileCountsSchema);
  return { followers: d.followers_count ?? 0, media: d.media_count ?? 0 };
}

export interface AccountDayMetrics {
  reach: number;
  views: number;
  profile_views: number;
}

/**
 * GET /{ig-user-id}/insights?metric=reach,views,profile_views&period=day&metric_type=total_value
 * since/until 은 unix seconds. 하루 범위로 호출해 그날의 합계를 얻는다.
 */
export async function getAccountDayMetrics(
  igUserId: string,
  token: string,
  sinceSec: number,
  untilSec: number,
  f: Fetch = fetch,
): Promise<AccountDayMetrics> {
  const res = await f(
    graphUrl(`${igUserId}/insights`, {
      metric: "reach,views,profile_views",
      period: "day",
      metric_type: "total_value",
      since: String(sinceSec),
      until: String(untilSec),
      access_token: token,
    }),
  );
  const list = await parseJson(res, InsightListSchema);
  return { reach: pickMetric(list, "reach"), views: pickMetric(list, "views"), profile_views: pickMetric(list, "profile_views") };
}

export interface MediaMetrics {
  views: number;
  reach: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  total_interactions: number;
}

/** GET /{ig-media-id}/insights?metric=views,reach,likes,comments,saved,shares,total_interactions */
export async function getMediaMetrics(igMediaId: string, token: string, f: Fetch = fetch): Promise<MediaMetrics> {
  const res = await f(
    graphUrl(`${igMediaId}/insights`, {
      metric: "views,reach,likes,comments,saved,shares,total_interactions",
      access_token: token,
    }),
  );
  const list = await parseJson(res, InsightListSchema);
  return {
    views: pickMetric(list, "views"),
    reach: pickMetric(list, "reach"),
    likes: pickMetric(list, "likes"),
    comments: pickMetric(list, "comments"),
    saves: pickMetric(list, "saved"),
    shares: pickMetric(list, "shares"),
    total_interactions: pickMetric(list, "total_interactions"),
  };
}
