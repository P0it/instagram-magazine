import type { IconKey, StickerKey } from "@/types";

/**
 * 스티커 정의. 좌표/크기는 1080×1350 논리 px.
 * - width: 캔버스에 처음 얹을 때 폭
 * - aspect: 고정 비율 (null 이면 내용에 맞춤)
 * - textScale: fontSize = width * textScale
 * - useColor: layer.color 가 배경색이 된다 (글자는 흰색)
 */
export interface StickerDef {
  key: StickerKey;
  label: string;
  text: string;
  width: number;
  aspect: number | null;
  textScale: number;
  useColor: boolean;
  /** 기본 배경 (useColor 가 아닐 때) */
  bg: string | null;
  /** 기본 글자색 (useColor 가 아닐 때) */
  ink: string;
  radius: number;
  shadow: boolean;
  dashed: boolean;
  /** 위/아래 얇은 선 (날짜) */
  rules: boolean;
  weight: number;
  letterSpacing: number;
}

export const STICKERS: readonly StickerDef[] = [
  { key: "tape", label: "테이프", text: "이번 주 체크", width: 500, aspect: null, textScale: 0.1, useColor: false, bg: "rgba(255,255,255,0.86)", ink: "#171719", radius: 0, shadow: true, dashed: false, rules: false, weight: 600, letterSpacing: 0.5 },
  { key: "badge", label: "원형 배지", text: "NEW", width: 190, aspect: 1, textScale: 0.3, useColor: true, bg: null, ink: "#FFFFFF", radius: 9999, shadow: false, dashed: false, rules: false, weight: 700, letterSpacing: 1.5 },
  { key: "pill", label: "라벨", text: "체크리스트", width: 450, aspect: null, textScale: 0.14, useColor: false, bg: "#FFFFFF", ink: "#171719", radius: 9999, shadow: false, dashed: false, rules: false, weight: 600, letterSpacing: 0 },
  { key: "quote", label: "따옴표", text: "“", width: 220, aspect: 1, textScale: 1.5, useColor: false, bg: null, ink: "#FFFFFF", radius: 0, shadow: false, dashed: false, rules: false, weight: 700, letterSpacing: 0 },
  { key: "arrow", label: "화살표", text: "→", width: 200, aspect: 2, textScale: 0.6, useColor: false, bg: null, ink: "#FFFFFF", radius: 0, shadow: false, dashed: false, rules: false, weight: 600, letterSpacing: 0 },
  { key: "highlight", label: "하이라이트", text: "핵심", width: 280, aspect: null, textScale: 0.36, useColor: true, bg: null, ink: "#FFFFFF", radius: 0, shadow: false, dashed: false, rules: false, weight: 700, letterSpacing: 0 },
  { key: "date", label: "날짜", text: "09.14", width: 240, aspect: null, textScale: 0.28, useColor: false, bg: null, ink: "#FFFFFF", radius: 0, shadow: false, dashed: false, rules: true, weight: 600, letterSpacing: 4 },
  { key: "frame", label: "점선 프레임", text: "", width: 600, aspect: 4 / 5, textScale: 0.2, useColor: false, bg: null, ink: "#FFFFFF", radius: 6, shadow: false, dashed: true, rules: false, weight: 600, letterSpacing: 0 },
];

export function stickerDef(key: string): StickerDef {
  return STICKERS.find((s) => s.key === key) ?? STICKERS[0];
}

export const ICONS: readonly { key: IconKey; label: string }[] = [
  { key: "sparkles", label: "반짝" },
  { key: "heart", label: "하트" },
  { key: "check", label: "체크" },
  { key: "clock", label: "시계" },
  { key: "bookmark", label: "저장" },
  { key: "pencil", label: "연필" },
  { key: "eye", label: "눈" },
  { key: "link", label: "링크" },
  { key: "circle-check", label: "확인" },
  { key: "info", label: "정보" },
];

export function iconLabel(key: string): string {
  return ICONS.find((i) => i.key === key)?.label ?? key;
}

/** 스티커의 실제 배경/글자색 (오버라이드 → 기본) */
export function stickerColors(def: StickerDef, layer: { color: string; bg: string | null; ink: string | null }): { bg: string | null; ink: string } {
  const bg = layer.bg === "none" ? null : (layer.bg ?? (def.useColor ? layer.color : def.bg));
  const ink = layer.ink ?? (def.useColor ? "#FFFFFF" : layer.color || def.ink);
  return { bg, ink };
}

/** 내용 기반 스티커 높이 추정 (height 오버라이드가 없을 때) */
export function stickerHeight(def: StickerDef, width: number): number {
  if (def.aspect) return width / def.aspect;
  const fs = width * def.textScale;
  const pad = def.key === "tape" ? 1.4 : def.key === "pill" ? 1.1 : def.key === "highlight" ? 0.2 : def.key === "date" ? 0.9 : 0.2;
  return Math.round(fs * (1.2 + pad));
}
