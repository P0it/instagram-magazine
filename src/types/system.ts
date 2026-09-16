import { z } from "zod";
import { AccountKeySchema } from "./account";
import { ContentTypeSchema, PostStatusSchema } from "./post";
import { FactCheckStatusSchema } from "./sources";

// ---------- index.json ----------
export const IndexWarningSchema = z.enum([
  "status_mismatch",
  "missing_render",
  "render_count_mismatch",
  "missing_metadata",
  "invalid_metadata",
  "stale_lock",
]);
export type IndexWarning = z.infer<typeof IndexWarningSchema>;

export const IndexEntrySchema = z.object({
  post_id: z.string(),
  channel: AccountKeySchema,
  status: PostStatusSchema,
  folder_status: PostStatusSchema,
  drive_folder_id: z.string(),
  headline: z.string().default(""),
  topic: z.string().default(""),
  content_type: ContentTypeSchema.default("carousel"),
  slide_count: z.number().int().default(0),
  render_count: z.number().int().default(0),
  cover_thumb_file_id: z.string().nullable().default(null),
  fact_check_status: FactCheckStatusSchema.default("pending"),
  fact_check_required: z.boolean().default(false),
  scheduled_at: z.string().nullable().default(null),
  published_at: z.string().nullable().default(null),
  ig_media_id: z.string().nullable().default(null),
  account_key: z.string().nullable().default(null),
  last_error: z.string().nullable().default(null),
  created_at: z.string(),
  updated_at: z.string(),
  warnings: z.array(IndexWarningSchema).default([]),
});
export type IndexEntry = z.infer<typeof IndexEntrySchema>;

export const IndexFileSchema = z.object({
  generated_at: z.string(),
  posts: z.array(IndexEntrySchema).default([]),
});
export type IndexFile = z.infer<typeof IndexFileSchema>;

// ---------- ingest-log.json ----------
export const IngestResultSchema = z.enum(["created", "needs_repair", "skipped", "error"]);

export const IngestLogEntrySchema = z.object({
  at: z.string(),
  channel: AccountKeySchema,
  prefix: z.string(),
  source_fingerprint: z.string(),
  result: IngestResultSchema,
  post_id: z.string().nullable().default(null),
  message: z.string().default(""),
});
export type IngestLogEntry = z.infer<typeof IngestLogEntrySchema>;

export const IngestLogFileSchema = z.object({
  last_sync_at: z.string().nullable().default(null),
  entries: z.array(IngestLogEntrySchema).default([]),
});
export type IngestLogFile = z.infer<typeof IngestLogFileSchema>;
