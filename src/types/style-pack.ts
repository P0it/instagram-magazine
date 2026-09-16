import { z } from "zod";
import { PresetIdSchema, ToneDefaultsSchema } from "./preset";
import { SlideRoleSchema } from "./slide-role";

export const StylePackSchema = z.object({
  schema_version: z.literal(1).default(1),
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  description: z.string().default(""),
  palette: z
    .object({
      background: z.string().default("#0a0a0a"),
      text: z.string().default("#ffffff"),
      accent: z.string().default("#e5e5e5"),
      muted: z.string().default("#8a8a8a"),
    })
    .prefault({}),
  typography: z
    .object({
      fontFamily: z.enum(["sans", "serif"]).default("sans"),
      headlineWeight: z.number().int().default(700),
      bodyWeight: z.number().int().default(400),
      letterSpacing: z.number().default(-1),
      lineHeight: z.number().default(1.25),
    })
    .prefault({}),
  tone: ToneDefaultsSchema.partial().prefault({}),
  presets_by_role: z.partialRecord(SlideRoleSchema, PresetIdSchema).prefault({}),
  preset_overrides: z
    .partialRecord(PresetIdSchema, ToneDefaultsSchema.partial())
    .prefault({}),
  references: z.array(z.string()).default([]),
  created_at: z.string().optional(),
});
export type StylePack = z.infer<typeof StylePackSchema>;
