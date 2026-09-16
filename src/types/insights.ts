import { z } from "zod";
import { AccountKeySchema } from "./account";

// ---------- _system/insights/<account_key>.json ----------

/** 계정 단위 일별 스냅샷. 하루 1행. */
export const AccountDaySchema = z.object({
  /** YYYY-MM-DD (UTC) */
  date: z.string(),
  followers: z.number().int().default(0),
  reach: z.number().int().default(0),
  views: z.number().int().default(0),
  profile_views: z.number().int().default(0),
});
export type AccountDay = z.infer<typeof AccountDaySchema>;

/** 게시물 단위 누적 지표. 수집할 때마다 덮어쓴다. */
export const MediaInsightSchema = z.object({
  ig_media_id: z.string(),
  post_id: z.string().nullable().default(null),
  views: z.number().int().default(0),
  reach: z.number().int().default(0),
  likes: z.number().int().default(0),
  comments: z.number().int().default(0),
  saves: z.number().int().default(0),
  shares: z.number().int().default(0),
  total_interactions: z.number().int().default(0),
  collected_at: z.string(),
});
export type MediaInsight = z.infer<typeof MediaInsightSchema>;

export const InsightsFileSchema = z.object({
  schema_version: z.literal(1).default(1),
  account_key: z.string(),
  ig_user_id: z.string().nullable().default(null),
  last_collected_at: z.string().nullable().default(null),
  last_error: z.string().nullable().default(null),
  days: z.array(AccountDaySchema).default([]),
  media: z.array(MediaInsightSchema).default([]),
});
export type InsightsFile = z.infer<typeof InsightsFileSchema>;

// ---------- API ----------

export const InsightsRangeSchema = z.enum(["7", "28", "90"]);
export type InsightsRange = z.infer<typeof InsightsRangeSchema>;

export const MetricDeltaSchema = z.object({
  value: z.number(),
  /** 직전 동일 기간 대비 값. 비교 데이터 없으면 null */
  previous: z.number().nullable(),
});
export type MetricDelta = z.infer<typeof MetricDeltaSchema>;

export const AccountSummarySchema = z.object({
  account_key: z.string(),
  channel: AccountKeySchema.nullable(),
  username: z.string().nullable(),
  last_collected_at: z.string().nullable(),
  last_error: z.string().nullable(),
  followers: MetricDeltaSchema,
  reach: MetricDeltaSchema,
  views: MetricDeltaSchema,
  profile_views: MetricDeltaSchema,
  /** 기간 내 일별 시계열 (오름차순) */
  series: z.array(AccountDaySchema),
  /** 기간 내 게시물 수 · 평균 도달 · 저장률(saves/reach) */
  posts_in_range: z.number().int(),
  avg_reach_per_post: z.number(),
  save_rate: z.number(),
});
export type AccountSummary = z.infer<typeof AccountSummarySchema>;

export const MediaRowSchema = MediaInsightSchema.extend({
  channel: AccountKeySchema,
  account_key: z.string(),
  headline: z.string().default(""),
  cover_thumb_file_id: z.string().nullable().default(null),
  published_at: z.string().nullable().default(null),
});
export type MediaRow = z.infer<typeof MediaRowSchema>;

export const InsightsResponseSchema = z.object({
  generated_at: z.string(),
  range: InsightsRangeSchema,
  accounts: z.array(AccountSummarySchema),
  media: z.array(MediaRowSchema),
});
export type InsightsResponse = z.infer<typeof InsightsResponseSchema>;

export const CollectResultSchema = z.object({
  collected_at: z.string(),
  accounts: z.array(
    z.object({
      account_key: z.string(),
      ok: z.boolean(),
      media_updated: z.number().int(),
      error: z.string().nullable().default(null),
    }),
  ),
});
export type CollectResult = z.infer<typeof CollectResultSchema>;
