import { z } from "zod";
import { ChannelKeySchema, SlideRoleSchema } from "./channel";
import { LayoutPresetOverridesSchema, PresetIdSchema } from "./preset";

export const POST_STATUSES = [
  "needs_repair",
  "draft",
  "approved",
  "scheduled",
  "publishing",
  "published",
  "failed",
] as const;
export const PostStatusSchema = z.enum(POST_STATUSES);
export type PostStatus = z.infer<typeof PostStatusSchema>;

export const ContentTypeSchema = z.enum(["single", "carousel"]);
export type ContentType = z.infer<typeof ContentTypeSchema>;

export const AssetModeSchema = z.enum([
  "official",
  "stock",
  "screenshot",
  "generated",
  "upload",
  "text_only",
]);
export type AssetMode = z.infer<typeof AssetModeSchema>;

export const SlideDefSchema = z.object({
  id: z.string(),
  role: SlideRoleSchema.default("info"),
  text: z.string().default(""),
  asset: z.string().nullable().optional().default(null),
  style_preset: PresetIdSchema.default("info-dark"),
  overrides: LayoutPresetOverridesSchema.optional(),
});
export type SlideDef = z.infer<typeof SlideDefSchema>;

export const PublishBlockSchema = z.object({
  account_key: z.string(),
  mode: z.enum(["immediate", "scheduled"]).default("immediate"),
  run_at: z.string().optional(),
  attempt: z.number().int().default(0),
  max_attempts: z.number().int().default(3),
  last_error: z.string().optional(),
  locked_at: z.string().optional(),
  ig_creation_id: z.string().optional(),
  ig_media_id: z.string().optional(),
  published_at: z.string().optional(),
});
export type PublishBlock = z.infer<typeof PublishBlockSchema>;

export const PostMetadataSchema = z.object({
  schema_version: z.literal(1).default(1),
  post_id: z.string(),
  channel: ChannelKeySchema,
  status: PostStatusSchema.default("draft"),
  content_type: ContentTypeSchema.default("carousel"),
  topic: z.string().default(""),
  headline: z.string().default(""),
  slides: z.array(SlideDefSchema).default([]),
  caption: z.string().default(""),
  hashtags: z.array(z.string()).default([]),
  alt_text: z.string().optional(),
  asset_mode: AssetModeSchema.default("text_only"),
  fact_check_required: z.boolean().default(false),
  scheduled_at: z.string().nullable().default(null),
  publish: PublishBlockSchema.optional(),
  warnings: z.array(z.string()).default([]),
  created_at: z.string(),
  updated_at: z.string(),
});
export type PostMetadata = z.infer<typeof PostMetadataSchema>;

/** 클라이언트가 PUT 할 때 보낼 수 있는 필드. 상태/게시 블록은 전이 API로만 바꾼다. */
export const PostMetadataPatchSchema = PostMetadataSchema.pick({
  topic: true,
  headline: true,
  slides: true,
  caption: true,
  hashtags: true,
  alt_text: true,
  asset_mode: true,
  content_type: true,
}).partial();
export type PostMetadataPatch = z.infer<typeof PostMetadataPatchSchema>;
