import { z } from "zod";
import { AccountKeySchema } from "./account";
import { SlideRoleSchema } from "./slide-role";
import { AssetModeSchema, ContentTypeSchema } from "./post";
import { SourceSchema } from "./sources";

/** ChatGPT가 쓴 .md의 front-matter. 전부 optional — 부분 파싱 허용. */
export const InboxFrontMatterSchema = z.object({
  channel: AccountKeySchema.optional(),
  content_type: ContentTypeSchema.optional(),
  topic: z.string().optional(),
  headline: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  sources: z.array(SourceSchema.partial()).optional(),
  visual_direction: z.string().optional(),
  asset_mode: AssetModeSchema.optional(),
  alt_text: z.string().optional(),
});
export type InboxFrontMatter = z.infer<typeof InboxFrontMatterSchema>;

export const ParsedSlideSchema = z.object({
  index: z.number().int(),
  role: SlideRoleSchema,
  text: z.string(),
});
export type ParsedSlide = z.infer<typeof ParsedSlideSchema>;

export const ParsedInboxDocSchema = z.object({
  frontMatter: InboxFrontMatterSchema,
  slides: z.array(ParsedSlideSchema),
  caption: z.string(),
  problems: z.array(z.string()),
});
export type ParsedInboxDoc = z.infer<typeof ParsedInboxDocSchema>;

export const InboxGroupSchema = z.object({
  prefix: z.string(),
  date: z.string().nullable(),
  slug: z.string(),
  markdownFileId: z.string().nullable(),
  imageFileIds: z.array(z.object({ fileId: z.string(), name: z.string(), order: z.number().int() })),
  otherFileIds: z.array(z.object({ fileId: z.string(), name: z.string() })),
});
export type InboxGroup = z.infer<typeof InboxGroupSchema>;
