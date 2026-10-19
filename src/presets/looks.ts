import type { SlideImageState } from "@/types";

/** 사진 색감 프리셋(라이트룸의 "프리셋"). 색 보정 필드만 바꾸고 줌·팬·오버레이·배경은 건드리지 않는다. */
export type LookValues = Pick<SlideImageState, "brightness" | "contrast" | "saturation" | "warmth" | "fade" | "vignette" | "blur">;

export interface Look {
  id: string;
  label: string;
  hint: string;
  /** 칩에 찍는 대표 색 */
  swatch: string;
  values: LookValues;
}

const base: LookValues = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, fade: 0, vignette: 0, blur: 0 };

export const LOOKS: Look[] = [
  { id: "natural", label: "원본", hint: "보정 없음", swatch: "#9ca3af", values: base },
  { id: "clean-bright", label: "클린 브라이트", hint: "밝고 깨끗한 카페·음식 사진", swatch: "#fde68a", values: { ...base, brightness: 0.06, contrast: 8, saturation: 0.1, warmth: 4 } },
  { id: "warm-cafe", label: "웜 카페", hint: "따뜻한 조명, 약한 비네팅", swatch: "#f59e0b", values: { ...base, brightness: 0.02, contrast: 10, saturation: 0.15, warmth: 35, fade: 8, vignette: 15 } },
  { id: "film-fade", label: "필름 페이드", hint: "빛바랜 필름 질감", swatch: "#d6a77a", values: { ...base, contrast: -6, saturation: -0.15, warmth: 12, fade: 35, vignette: 20 } },
  { id: "moody-dark", label: "무디 다크", hint: "어둡고 대비 센 분위기", swatch: "#1f2937", values: { ...base, brightness: -0.12, contrast: 22, saturation: -0.1, warmth: -8, vignette: 45 } },
  { id: "cool-mint", label: "쿨 민트", hint: "차가운 청록 톤", swatch: "#5eead4", values: { ...base, contrast: 12, saturation: -0.05, warmth: -30, fade: 6 } },
  { id: "mono", label: "모노", hint: "흑백, 약한 페이드", swatch: "#6b7280", values: { ...base, contrast: 18, saturation: -1, fade: 12, vignette: 25 } },
  { id: "text-backdrop", label: "글자 배경용", hint: "흐리고 살짝 어둡게 — 위에 글자 올릴 때", swatch: "#475569", values: { ...base, brightness: -0.08, contrast: -4, saturation: -0.1, blur: 10 } },
];
