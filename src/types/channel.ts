import { z } from "zod";
import { PresetIdSchema } from "./preset";

export const ChannelKeySchema = z.enum(["LIFE", "MIND", "AI", "TREND"]);
export type ChannelKey = z.infer<typeof ChannelKeySchema>;
export const CHANNEL_KEYS = ChannelKeySchema.options;

export const SlideRoleSchema = z.enum([
  "cover",
  "photo",
  "info",
  "quote",
  "screenshot",
  "closing",
]);
export type SlideRole = z.infer<typeof SlideRoleSchema>;

export const ChannelConfigSchema = z.object({
  key: ChannelKeySchema,
  name: z.string(),
  color: z.string().default("#171717"),
  drive_folder_id: z.string().nullable().default(null),
  default_style_pack: z.string().nullable().default(null),
  default_presets_by_role: z
    .partialRecord(SlideRoleSchema, PresetIdSchema)
    .prefault({}),
  instagram_account_key: z.string().nullable().default(null),
  caption_template: z.string().default("{{caption}}\n\n{{hashtags}}"),
  default_hashtags: z.array(z.string()).default([]),
  editorial_rules: z
    .object({ fact_check_required: z.boolean().default(false) })
    .default({ fact_check_required: false }),
});
export type ChannelConfig = z.infer<typeof ChannelConfigSchema>;

export const ChannelsFileSchema = z.object({
  channels: z.array(ChannelConfigSchema),
});
export type ChannelsFile = z.infer<typeof ChannelsFileSchema>;
