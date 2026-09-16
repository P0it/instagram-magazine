import {
  LayoutPresetSchema,
  type LayoutPreset,
  type LayoutPresetOverrides,
  type PresetId,
  type SlideRole,
  type ToneDefaults,
  StylePackSchema,
  type StylePack,
} from "@/types";

import largeEditorial from "./layouts/large-editorial.json";
import coverCenter from "./layouts/cover-center.json";
import coverBottom from "./layouts/cover-bottom.json";
import photoCaption from "./layouts/photo-caption.json";
import infoDark from "./layouts/info-dark.json";
import infoLight from "./layouts/info-light.json";
import quoteCenter from "./layouts/quote-center.json";
import screenshotFrame from "./layouts/screenshot-frame.json";
import listEditorial from "./layouts/list-editorial.json";
import closingSlide from "./layouts/closing-slide.json";

import lifeStyle from "./styles/life-quiet-editorial.json";
import mindStyle from "./styles/mind-soft-paper.json";
import aiStyle from "./styles/ai-mono-grid.json";
import trendStyle from "./styles/trend-hotspot.json";

export const LAYOUT_PRESETS: readonly LayoutPreset[] = LayoutPresetSchema.array().parse([
  largeEditorial,
  coverCenter,
  coverBottom,
  photoCaption,
  infoDark,
  infoLight,
  quoteCenter,
  screenshotFrame,
  listEditorial,
  closingSlide,
]);

const PRESET_MAP: ReadonlyMap<PresetId, LayoutPreset> = new Map(
  LAYOUT_PRESETS.map((p) => [p.id, p]),
);

export function getPreset(id: PresetId): LayoutPreset {
  const p = PRESET_MAP.get(id);
  if (!p) throw new Error(`Unknown preset: ${id}`);
  return p;
}

export const BUILTIN_STYLE_PACKS: readonly StylePack[] = StylePackSchema.array().parse([
  lifeStyle,
  mindStyle,
  aiStyle,
  trendStyle,
]);

export const ROLE_DEFAULT_PRESET: Record<SlideRole, PresetId> = {
  cover: "large-editorial",
  photo: "cover-bottom",
  info: "info-dark",
  quote: "quote-center",
  screenshot: "screenshot-frame",
  closing: "closing-slide",
};

export function getStylePack(id: string | null | undefined): StylePack | undefined {
  if (!id) return undefined;
  return BUILTIN_STYLE_PACKS.find((s) => s.id === id);
}

/** 계정 오버라이드 > 스타일팩 > 역할 기본. */
export function defaultPresetForRole(
  role: SlideRole,
  stylePack?: StylePack | null,
  accountOverrides?: Partial<Record<SlideRole, PresetId>>,
): PresetId {
  return accountOverrides?.[role] ?? stylePack?.presets_by_role[role] ?? ROLE_DEFAULT_PRESET[role];
}

/** 프리셋 + 스타일팩 + 슬라이드 오버라이드를 합친 최종 레이아웃 */
export function resolvePreset(
  id: PresetId,
  overrides?: LayoutPresetOverrides,
  stylePack?: StylePack | null,
): LayoutPreset {
  const base = getPreset(id);
  const tone: ToneDefaults = {
    ...base.toneDefaults,
    ...(stylePack?.tone ?? {}),
    ...(stylePack?.preset_overrides[id] ?? {}),
    ...(overrides?.toneDefaults ?? {}),
  };
  const { toneDefaults: _ignored, ...rest } = overrides ?? {};
  void _ignored;
  return { ...base, ...rest, id, toneDefaults: tone };
}
