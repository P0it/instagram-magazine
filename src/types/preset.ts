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
export const FONT_FAMILIES = [
  "sans", "serif", "nanum-myeongjo", "song-myung", "gowun-dodum", "black-han-sans", "gaegu",
  "gowun-batang", "ibm-plex-sans-kr", "do-hyeon", "jua", "yeon-sung", "dongle", "nanum-pen",
  "playfair-display", "dm-serif-display", "bebas-neue", "anton", "space-grotesk",
] as const;
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
  "gowun-batang": { label: "고운바탕", cssVar: "--font-gowun-batang", fallback: "serif", family: "Gowun Batang" },
  "ibm-plex-sans-kr": { label: "IBM 플렉스", cssVar: "--font-ibm-plex-sans-kr", fallback: "sans-serif", family: "IBM Plex Sans KR" },
  "do-hyeon": { label: "도현 · 굵은 제목", cssVar: "--font-do-hyeon", fallback: "sans-serif", family: "Do Hyeon" },
  jua: { label: "주아 · 둥근 제목", cssVar: "--font-jua", fallback: "sans-serif", family: "Jua" },
  "yeon-sung": { label: "연성 · 손글씨", cssVar: "--font-yeon-sung", fallback: "cursive", family: "Yeon Sung" },
  dongle: { label: "동글 · 얇고 둥근", cssVar: "--font-dongle", fallback: "sans-serif", family: "Dongle" },
  "nanum-pen": { label: "나눔펜 · 펜글씨", cssVar: "--font-nanum-pen", fallback: "cursive", family: "Nanum Pen Script" },
  "playfair-display": { label: "Playfair · 영문 세리프", cssVar: "--font-playfair-display", fallback: "serif", family: "Playfair Display" },
  "dm-serif-display": { label: "DM Serif · 영문 디스플레이", cssVar: "--font-dm-serif-display", fallback: "serif", family: "DM Serif Display" },
  "bebas-neue": { label: "Bebas Neue · 영문 대문자", cssVar: "--font-bebas-neue", fallback: "sans-serif", family: "Bebas Neue" },
  anton: { label: "Anton · 영문 임팩트", cssVar: "--font-anton", fallback: "sans-serif", family: "Anton" },
  "space-grotesk": { label: "Space Grotesk · 영문 모던", cssVar: "--font-space-grotesk", fallback: "sans-serif", family: "Space Grotesk" },
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
