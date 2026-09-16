"use client";

import type { z } from "zod";
import {
  AccountsResponseSchema,
  AnalyzeResponseSchema,
  CustomPresetsFileSchema,
  type CustomPreset,
  ApiErrorSchema,
  ApprovalGateResultSchema,
  ChannelsFileSchema,
  CollectResultSchema,
  IndexEntrySchema,
  InsightsResponseSchema,
  PostBundleSchema,
  PublishResultSchema,
  StylePackSchema,
  SyncResponseSchema,
  SystemStatusSchema,
  type ChannelsFile,
  type InsightsRange,
  type PostSaveRequest,
  type PostStatus,
  type PublishRequest,
} from "@/types";
import { z as zod } from "zod";


export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function request<S extends z.ZodTypeAny>(url: string, schema: S, init?: RequestInit): Promise<z.output<S>> {
  const res = await fetch(url, { ...init, headers: { Accept: "application/json", ...(init?.headers ?? {}) } });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const err = ApiErrorSchema.safeParse(body);
    throw new ApiClientError(err.success ? err.data.error : `HTTP ${res.status}`, res.status, err.success ? err.data.code : undefined, err.success ? err.data.details : undefined);
  }
  return schema.parse(body);
}

const jsonInit = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const PostsListSchema = zod.object({ generated_at: zod.string(), posts: zod.array(IndexEntrySchema) });

export interface PostsQuery {
  channel?: string;
  status?: PostStatus;
  type?: string;
  from?: string;
  to?: string;
  q?: string;
}

export const api = {
  systemStatus: () => request("/api/system/status", SystemStatusSchema),

  listPosts: (q: PostsQuery = {}) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v) params.set(k, v);
    const qs = params.toString();
    return request(`/api/posts${qs ? `?${qs}` : ""}`, PostsListSchema);
  },
  getPost: (id: string) => request(`/api/posts/${encodeURIComponent(id)}`, PostBundleSchema),
  savePost: (id: string, body: PostSaveRequest) => request(`/api/posts/${encodeURIComponent(id)}`, PostBundleSchema, jsonInit("PUT", body)),
  uploadRenders: (id: string, blobs: Blob[]) => {
    const form = new FormData();
    blobs.forEach((b, i) => form.append(`slide_${i}`, b, `slide_${String(i + 1).padStart(2, "0")}.jpg`));
    return request(`/api/posts/${encodeURIComponent(id)}/renders`, PostBundleSchema, { method: "PUT", body: form });
  },
  uploadAsset: (id: string, file: File, slideId?: string, kind: "source" | "cutout" = "source") => {
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    if (slideId) form.append("slide_id", slideId);
    return request(`/api/posts/${encodeURIComponent(id)}/assets`, PostBundleSchema.extend({ uploaded: zod.string() }), { method: "POST", body: form });
  },
  transition: (id: string, to: PostStatus, extra: { run_at?: string; account_key?: string } = {}) =>
    request(`/api/posts/${encodeURIComponent(id)}/transition`, PostBundleSchema, jsonInit("POST", { to, ...extra })),
  repair: (id: string, strategy: "folder" | "metadata") =>
    request(`/api/posts/${encodeURIComponent(id)}/repair`, PostBundleSchema, jsonInit("POST", { strategy })),
  approval: (id: string) => request(`/api/posts/${encodeURIComponent(id)}/approval`, ApprovalGateResultSchema),
  publish: (id: string, body: PublishRequest) => request(`/api/posts/${encodeURIComponent(id)}/publish`, PublishResultSchema, jsonInit("POST", body)),
  retry: (id: string) => request(`/api/posts/${encodeURIComponent(id)}/retry`, PublishResultSchema, jsonInit("POST")),

  sync: () => request("/api/ingest/sync", SyncResponseSchema, jsonInit("POST")),

  insights: (range: InsightsRange) => request(`/api/insights?range=${range}`, InsightsResponseSchema),
  collectInsights: () => request("/api/insights/collect", CollectResultSchema, jsonInit("POST")),

  accounts: () => request("/api/instagram/accounts", AccountsResponseSchema),
  disconnectAccount: (key: string) => request("/api/instagram/accounts", AccountsResponseSchema, jsonInit("DELETE", { key })),

  channels: () => request("/api/channels", ChannelsFileSchema),
  saveChannels: (body: ChannelsFile) => request("/api/channels", ChannelsFileSchema, jsonInit("PUT", body)),

  stylePacks: () => request("/api/style-packs", zod.object({ packs: zod.array(StylePackSchema) })),
  importStylePack: (raw: unknown) => request("/api/style-packs", StylePackSchema, jsonInit("POST", raw)),
  assignStylePack: (channel: string, pack_id: string | null) => request("/api/style-packs", zod.object({ ok: zod.boolean() }), jsonInit("PATCH", { channel, pack_id })),
  deleteStylePack: (id: string) => request(`/api/style-packs/${encodeURIComponent(id)}`, zod.object({ ok: zod.boolean() }), jsonInit("DELETE")),
};

export const driveFileUrl = (fileId: string) => `/api/drive/file/${encodeURIComponent(fileId)}`;
