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

/**
 * 캔버스 렌더 폰트. 전부 next/font 로 self-host (app/layout.tsx) → 내보내기 결정적.
 * sans/serif 는 채널 스타일팩이 정하는 기본 둘, 나머지는 레이어 단위로 고르는 표현용.
 */
export const FONT_FAMILIES = ["sans", "serif", "nanum-myeongjo", "song-myung", "gowun-dodum", "black-han-sans", "gaegu"] as const;
export const FontFamilySchema = z.enum(FONT_FAMILIES);
export type FontFamily = z.infer<typeof FontFamilySchema>;

export const FONT_META: Record<FontFamily, { label: string; cssVar: string; fallback: string; family: string }> = {
  sans: { label: "산세리프", cssVar: "--font-sans-kr", fallback: "sans-serif", family: "Noto Sans KR" },
  serif: { label: "세리프", cssVar: "--font-serif-kr", fallback: "serif", family: "Noto Serif KR" },
  "nanum-myeongjo": { label: "나눔명조", cssVar: "--font-nanum-myeongjo", fallback: "serif", family: "Nanum Myeongjo" },
  "song-myung": { label: "송명", cssVar: "--font-song-myung", fallback: "serif", family: "Song Myung" },
  "gowun-dodum": { label: "고운돋움", cssVar: "--font-gowun-dodum", fallback: "sans-serif", family: "Gowun Dodum" },
  "black-han-sans": { label: "Black Han Sans", cssVar: "--font-black-han-sans", fallback: "sans-serif", family: "Black Han Sans" },
  gaegu: { label: "개구 손글씨", cssVar: "--font-gaegu", fallback: "cursive", family: "Gaegu" },
};

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
