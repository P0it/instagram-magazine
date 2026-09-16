"use client";

/**
 * 브라우저 안에서 배경 제거 (@imgly/background-removal, ONNX/WASM).
 * 외부 API 키 없음. 모델 파일(~40MB)은 처음 한 번 CDN 에서 받아 브라우저 캐시에 남는다.
 * 라이브러리가 무거워서 실제 호출 시점에만 동적 import 한다.
 */
const MAX_EDGE = 1600;

export type CutoutProgress = (step: string, pct: number) => void;

export async function removeBackgroundToPng(file: File, onProgress?: CutoutProgress): Promise<File> {
  const { removeBackground } = await import("@imgly/background-removal");
  const source = await downscale(file, MAX_EDGE);
  const blob = await removeBackground(source, {
    model: "isnet_fp16",
    output: { format: "image/png", quality: 1 },
    progress: (key, current, total) => {
      const step = key.startsWith("fetch") ? "모델 내려받기" : "배경 지우기";
      onProgress?.(step, total > 0 ? current / total : 0);
    },
  });
  const base = file.name.replace(/\.[a-z0-9]+$/i, "") || "cutout";
  return new File([blob], `${base}.png`, { type: "image/png" });
}

/** 긴 변이 max 를 넘으면 캔버스로 줄인다 (추론 속도·업로드 크기) */
async function downscale(file: File, max: number): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (k === 1) {
    bmp.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("downscale failed"))), "image/png"));
}
