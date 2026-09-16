import { z } from "zod";
import { LayoutPresetOverridesSchema, PresetIdSchema, TextAlignSchema, TextPlacementSchema } from "./preset";

/**
 * 내 프리셋 — 스크린샷 분석 결과를 "기본 프리셋 + 오버라이드" 로 저장한다.
 * 슬라이드는 `style_preset: base` + `overrides` 로 이 값을 받으므로 PresetId enum 을 넓힐 필요가 없다.
 * Drive: _system/custom-presets.json
 */
export const CustomPresetSchema = z.object({
  id: z.string().regex(/^custom-[a-z0-9-]+$/),
  name: z.string().min(1).max(40),
  base: PresetIdSchema,
  overrides: LayoutPresetOverridesSchema,
  source: z.enum(["screenshot", "manual"]).default("screenshot"),
  /** 분석 모델이 남긴 한 줄 근거 */
  note: z.string().default(""),
  created_at: z.string(),
});
export type CustomPreset = z.infer<typeof CustomPresetSchema>;

export const CustomPresetsFileSchema = z.object({
  presets: z.array(CustomPresetSchema).default([]),
});
export type CustomPresetsFile = z.infer<typeof CustomPresetsFileSchema>;

/** 비전 모델이 돌려주는 레이아웃 판독 결과 (엄격 스키마) */
export const LayoutAnalysisSchema = z.object({
  textPlacement: TextPlacementSchema,
  align: TextAlignSchema,
  /** 텍스트 박스 폭 / 캔버스 폭 */
  textWidthRatio: z.number().min(0.2).max(1),
  /** 1080 기준 헤드라인 글자 크기 */
  fontSize: z.number().min(24).max(200),
  lines: z.number().int().min(1).max(8),
  weight: z.enum(["regular", "medium", "bold"]),
  fontKind: z.enum(["sans", "serif"]),
  /** 배경 톤 */
  background: z.enum(["dark", "light"]),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  overlayOpacity: z.number().min(0).max(1),
  gradient: z.enum(["none", "bottom", "top", "full"]),
  note: z.string().max(200).default(""),
});
export type LayoutAnalysis = z.infer<typeof LayoutAnalysisSchema>;

export const AnalyzeResponseSchema = z.object({
  analysis: LayoutAnalysisSchema,
  base: PresetIdSchema,
  overrides: LayoutPresetOverridesSchema,
  provider: z.enum(["sdk", "cli"]),
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

/** 분석 결과 → (기본 프리셋, 오버라이드). 클라이언트/서버 공용 순수 함수 */
export function analysisToPreset(a: LayoutAnalysis): { base: z.infer<typeof PresetIdSchema>; overrides: z.infer<typeof LayoutPresetOverridesSchema> } {
  const base: z.infer<typeof PresetIdSchema> =
    a.textPlacement === "center" ? (a.background === "light" ? "quote-center" : "cover-center")
    : a.textPlacement.startsWith("top") ? (a.background === "light" ? "info-light" : "info-dark")
    : a.textPlacement === "lower-third" ? "photo-caption"
    : a.fontSize >= 90 ? "large-editorial" : "cover-bottom";
  const weight = a.weight === "bold" ? 700 : a.weight === "medium" ? 500 : 400;
  return {
    base,
    overrides: {
      textPlacement: a.textPlacement,
      align: a.align,
      textWidthRatio: a.textWidthRatio,
      defaultFontSize: Math.round(a.fontSize),
      maxLines: Math.max(3, a.lines + 1),
      toneDefaults: {
        background: a.background === "light" ? "#f5f2ea" : "#0a0a0a",
        textColor: a.textColor,
        overlayOpacity: a.overlayOpacity,
        gradient: a.gradient,
        fontFamily: a.fontKind,
        weight,
      },
    },
  };
}
