"use client";

import type Konva from "konva";
import { CANVAS_HEIGHT, CANVAS_WIDTH, FONT_FAMILIES, FONT_META, type FontFamily } from "@/types";

/** CSS 에서 쓰는 font-family 값 (패널 미리보기용) */
export function cssFontFamily(kind: FontFamily): string {
  const m = FONT_META[kind];
  return `var(${m.cssVar}), "${m.family}", ${m.fallback}`;
}

/** Konva 는 CSS 변수를 못 읽으므로 next/font 가 만든 실제 폰트명으로 해석 */
export function konvaFontFamily(kind: FontFamily): string {
  const m = FONT_META[kind] ?? FONT_META.sans;
  if (typeof document === "undefined") return m.family;
  const v = getComputedStyle(document.documentElement).getPropertyValue(m.cssVar).trim();
  const primary = v.split(",")[0]?.replace(/['"]/g, "").trim();
  return primary || m.family;
}

export async function ensureFontsReady(): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  await document.fonts.ready;
  const families = FONT_FAMILIES.map((f) => konvaFontFamily(f));
  await Promise.all(
    families.flatMap((f) => [400, 700].map((w) => document.fonts.load(`${w} 48px "${f}"`).catch(() => []))),
  );
}

/**
 * 결정적 내보내기: 스테이지는 1080×H 논리 좌표를 scale 로 표시하므로
 * pixelRatio = 1080 / 표시 너비 로 정확히 포스트 규격(기본 1080×1350) JPEG.
 */
export async function exportStageToBlob(stage: Konva.Stage, quality = 0.92, expectedHeight = CANVAS_HEIGHT): Promise<Blob> {
  await ensureFontsReady();
  const displayedWidth = stage.width();
  const pixelRatio = CANVAS_WIDTH / displayedWidth;
  const dataUrl = stage.toDataURL({ pixelRatio, mimeType: "image/jpeg", quality });
  const blob = await (await fetch(dataUrl)).blob();
  const dims = await blobDimensions(blob);
  if (dims.width !== CANVAS_WIDTH || dims.height !== expectedHeight) {
    throw new Error(`export size mismatch: ${dims.width}x${dims.height}`);
  }
  return blob;
}

export function blobDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image decode failed"));
    };
    img.src = url;
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
