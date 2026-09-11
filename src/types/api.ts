import { z } from "zod";
import { EditorStateSchema } from "./editor-state";
import { PostMetadataPatchSchema, PostMetadataSchema, PostStatusSchema } from "./post";
import { SourcesFileSchema } from "./sources";
import { VisualBriefSchema } from "./visual-brief";
import { IngestLogEntrySchema, PublicAccountSchema } from "./system";
import { ChannelConfigSchema } from "./channel";

export const DriveFileRefSchema = z.object({
  fileId: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number().int().nullable().default(null),
  md5: z.string().nullable().default(null),
});
export type DriveFileRef = z.infer<typeof DriveFileRefSchema>;

/** GET /api/posts/[id] 응답 */
export const PostBundleSchema = z.object({
  metadata: PostMetadataSchema,
  sources: SourcesFileSchema,
  visualBrief: VisualBriefSchema,
  editorState: EditorStateSchema,
  folderId: z.string(),
  folderStatus: PostStatusSchema,
  assets: z.array(DriveFileRefSchema),
  renders: z.array(DriveFileRefSchema),
});
export type PostBundle = z.infer<typeof PostBundleSchema>;

/** PUT /api/posts/[id] 요청 */
export const PostSaveRequestSchema = z.object({
  expected_updated_at: z.string(),
  metadata: PostMetadataPatchSchema.optional(),
  editorState: EditorStateSchema.optional(),
  sources: SourcesFileSchema.partial().optional(),
});
export type PostSaveRequest = z.infer<typeof PostSaveRequestSchema>;

export const TransitionRequestSchema = z.object({
  to: PostStatusSchema,
  run_at: z.string().optional(),
  account_key: z.string().optional(),
});
export type TransitionRequest = z.infer<typeof TransitionRequestSchema>;

export const RepairRequestSchema = z.object({
  strategy: z.enum(["folder", "metadata"]),
});
export type RepairRequest = z.infer<typeof RepairRequestSchema>;

export const PublishRequestSchema = z.object({
  account_key: z.string(),
  mode: z.enum(["immediate", "scheduled"]),
  run_at: z.string().optional(),
});
export type PublishRequest = z.infer<typeof PublishRequestSchema>;

export const ApprovalCheckSchema = z.object({
  id: z.enum([
    "render_count",
    "render_dimensions",
    "caption_length",
    "hashtag_count",
    "fact_check",
    "has_slides",
    "has_headline",
  ]),
  label: z.string(),
  ok: z.boolean(),
  detail: z.string().default(""),
});
export type ApprovalCheck = z.infer<typeof ApprovalCheckSchema>;

export const ApprovalGateResultSchema = z.object({
  ok: z.boolean(),
  checks: z.array(ApprovalCheckSchema),
});
export type ApprovalGateResult = z.infer<typeof ApprovalGateResultSchema>;

export const SyncResponseSchema = z.object({
  synced_at: z.string(),
  created: z.number().int(),
  needs_repair: z.number().int(),
  skipped: z.number().int(),
  errors: z.number().int(),
  entries: z.array(IngestLogEntrySchema),
});
export type SyncResponse = z.infer<typeof SyncResponseSchema>;

export const AccountsResponseSchema = z.object({
  accounts: z.array(PublicAccountSchema),
  oauth_configured: z.boolean(),
});
export type AccountsResponse = z.infer<typeof AccountsResponseSchema>;

export const PublishResultSchema = z.object({
  ok: z.boolean(),
  status: PostStatusSchema,
  ig_media_id: z.string().optional(),
  error: z.string().optional(),
});
export type PublishResult = z.infer<typeof PublishResultSchema>;

export const ApiErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const SystemStatusSchema = z.object({
  drive_kind: z.enum(["mock", "google"]),
  oauth_configured: z.boolean(),
  access_key_enabled: z.boolean(),
  last_sync_at: z.string().nullable(),
  should_auto_sync: z.boolean(),
  accounts: z.array(PublicAccountSchema),
  channels: z.array(ChannelConfigSchema),
  recent_ingest: z.array(IngestLogEntrySchema),
});
export type SystemStatus = z.infer<typeof SystemStatusSchema>;
