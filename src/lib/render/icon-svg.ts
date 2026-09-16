"use client";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Bookmark, Check, CircleCheck, Clock, Eye, Heart, Info, Link, Pencil, Sparkles, type LucideIcon } from "lucide-react";
import type { IconKey } from "@/types";

/** 캔버스 아이콘 레이어에 쓰는 lucide 글리프. 목업의 Montage 아이콘과 1:1 대응. */
export const ICON_COMPONENTS: Record<IconKey, LucideIcon> = {
  sparkles: Sparkles,
  heart: Heart,
  check: Check,
  clock: Clock,
  bookmark: Bookmark,
  pencil: Pencil,
  eye: Eye,
  link: Link,
  "circle-check": CircleCheck,
  info: Info,
};

const cache = new Map<string, string>();

/**
 * lucide 아이콘을 지정 색의 SVG data URL 로. same-origin data: 라 Konva 내보내기에서 taint 없음.
 * 256px 뷰박스로 렌더해 캔버스 확대 시에도 선이 매끈하다.
 */
export function iconSvgDataUrl(key: string, color: string): string {
  const k = `${key}|${color}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const Comp = ICON_COMPONENTS[key as IconKey] ?? Sparkles;
  const svg = renderToStaticMarkup(createElement(Comp, { size: 256, color, strokeWidth: 2, xmlns: "http://www.w3.org/2000/svg" }));
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  cache.set(k, url);
  return url;
}
