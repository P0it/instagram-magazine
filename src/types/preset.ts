import { z } from "zod";

export const PRESET_IDS = [
  "large-editorial",
  "cover-center",
  "cover-bottom",
  "photo-caption",
  "info-dark",
  "info-light",
  "quote-center",
  "screenshot-frame",
  "list-editorial",
  "closing-slide",
] as const;

export const PresetIdSchema = z.enum(PRESET_IDS);
export type PresetId = z.infer<typeof PresetIdSchema>;

export const TextPlacementSchema = z.enum([
  "top-left",
  "top-center",
  "center",
  "bottom-left",
  "bottom-center",
  "lower-third",
]);
export type TextPlacement = z.infer<typeof TextPlacementSchema>;

export const TextAlignSchema = z.enum(["left", "center", "right"]);
export type TextAlign = z.infer<typeof TextAlignSchema>;

export const FontFamilySchema = z.enum(["sans", "serif"]);
export type FontFamily = z.infer<typeof FontFamilySchema>;

export const ToneDefaultsSchema = z.object({
  background: z.string().default("#0a0a0a"),
  textColor: z.string().default("#ffffff"),
  overlayOpacity: z.number().min(0).max(1).default(0.35),
  gradient: z.enum(["none", "bottom", "top", "full"]).default("bottom"),
  gradientOpacity: z.number().min(0).max(1).default(0.6),
  brightness: z.number().min(-1).max(1).default(0),
  contrast: z.number().min(-100).max(100).default(0),
  saturation: z.number().min(-2).max(2).default(0),
  blur: z.number().min(0).max(40).default(0),
  fontFamily: FontFamilySchema.default("sans"),
  weight: z.number().int().default(700),
  lineHeight: z.number().default(1.25),
  letterSpacing: z.number().default(-1),
  frame: z.boolean().default(false),
});
export type ToneDefaults = z.infer<typeof ToneDefaultsSchema>;

export const LayoutPresetSchema = z.object({
  id: PresetIdSchema,
  name: z.string(),
  description: z.string().default(""),
  roles: z.array(z.string()).default([]),
  textPlacement: TextPlacementSchema,
  defaultFontSize: z.number().default(72),
  textWidthRatio: z.number().min(0.2).max(1).default(0.84),
  maxLines: z.number().int().default(6),
  safeMargin: z.number().default(80),
  align: TextAlignSchema.default("left"),
  toneDefaults: ToneDefaultsSchema.prefault({}),
});
export type LayoutPreset = z.infer<typeof LayoutPresetSchema>;

export const LayoutPresetOverridesSchema = LayoutPresetSchema.omit({ id: true })
  .partial()
  .extend({ toneDefaults: ToneDefaultsSchema.partial().optional() });
export type LayoutPresetOverrides = z.infer<typeof LayoutPresetOverridesSchema>;
