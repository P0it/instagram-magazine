"use client";

import type Konva from "konva";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "@/types";

export const FONT_FAMILIES = {
  sans: "var(--font-sans-kr), 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif",
  serif: "var(--font-serif-kr), 'Noto Serif KR', 'Apple Myungjo', serif",
} as const;

/** Konva 는 CSS 변수를 못 읽으므로 실제 폰트명으로 해석 */
export function konvaFontFamily(kind: "sans" | "serif"): string {
  if (typeof document === "undefined") return kind === "sans" ? "Noto Sans KR" : "Noto Serif KR";
  const v = getComputedStyle(document.documentElement).getPropertyValue(kind === "sans" ? "--font-sans-kr" : "--font-serif-kr").trim();
  const primary = v.split(",")[0]?.replace(/['"]/g, "").trim();
  return primary || (kind === "sans" ? "Noto Sans KR" : "Noto Serif KR");
}

export async function ensureFontsReady(): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  await document.fonts.ready;
  const families = [konvaFontFamily("sans"), konvaFontFamily("serif")];
  await Promise.all(
    families.flatMap((f) => [400, 500, 600, 700].map((w) => document.fonts.load(`${w} 48px "${f}"`).catch(() => []))),
  );
}

/**
 * 결정적 내보내기: 스테이지는 1080×1350 논리 좌표를 scale 로 표시하므로
 * pixelRatio = 1080 / 표시 너비 로 정확히 1080×1350 JPEG.
 */
export async function exportStageToBlob(stage: Konva.Stage, quality = 0.92): Promise<Blob> {
  await ensureFontsReady();
  const displayedWidth = stage.width();
  const pixelRatio = CANVAS_WIDTH / displayedWidth;
  const dataUrl = stage.toDataURL({ pixelRatio, mimeType: "image/jpeg", quality });
  const blob = await (await fetch(dataUrl)).blob();
  const dims = await blobDimensions(blob);
  if (dims.width !== CANVAS_WIDTH || dims.height !== CANVAS_HEIGHT) {
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
