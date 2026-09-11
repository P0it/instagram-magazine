import { z } from "zod";

export const SourceTypeSchema = z.enum([
  "official",
  "news",
  "research",
  "blog",
  "social",
  "other",
]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const SourceSchema = z.object({
  title: z.string().default(""),
  url: z.string().default(""),
  publisher: z.string().default(""),
  source_type: SourceTypeSchema.default("other"),
  accessed_at: z.string().optional(),
  note: z.string().optional(),
});
export type Source = z.infer<typeof SourceSchema>;

export const FactCheckStatusSchema = z.enum(["pending", "approved", "rejected"]);
export type FactCheckStatus = z.infer<typeof FactCheckStatusSchema>;

export const SourcesFileSchema = z.object({
  fact_check_status: FactCheckStatusSchema.default("pending"),
  fact_checked_at: z.string().nullable().default(null),
  reviewer_note: z.string().default(""),
  items: z.array(SourceSchema).default([]),
});
export type SourcesFile = z.infer<typeof SourcesFileSchema>;
