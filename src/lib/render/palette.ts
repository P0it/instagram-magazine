/**
 * 이미지에서 주요 색을 뽑는다. 4비트 버킷(채널당 16단계)으로 센 뒤, 비중 큰 순서로
 * 이미 고른 색과 충분히 먼 것만 채택한다. 외부 라이브러리 없는 순수 함수라 테스트 가능.
 */
export function quantizePalette(data: ArrayLike<number>, count = 5, minDistance = 56, minShare = 0.012): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const cur = buckets.get(key);
    if (cur) {
      cur.n++;
      cur.r += r;
      cur.g += g;
      cur.b += b;
    } else buckets.set(key, { n: 1, r, g, b });
  }
  // 글자 가장자리의 중간색 같은 극소수 픽셀 색은 제외 (비중 minShare 미만)
  let total = 0;
  for (const v of buckets.values()) total += v.n;
  const sorted = [...buckets.values()].filter((v) => v.n / total >= minShare).sort((a, b) => b.n - a.n).map((v) => ({ r: Math.round(v.r / v.n), g: Math.round(v.g / v.n), b: Math.round(v.b / v.n) }));
  const picked: { r: number; g: number; b: number }[] = [];
  for (const c of sorted) {
    if (picked.every((p) => Math.hypot(p.r - c.r, p.g - c.g, p.b - c.b) >= minDistance)) picked.push(c);
    if (picked.length >= count) break;
  }
  return picked.map(toHex);
}

function toHex(c: { r: number; g: number; b: number }): string {
  return `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** 상대 휘도 0..1 — 밝은 색인지 판단할 때 */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/** 배경 위에서 읽히는 글자색 (흑/백) */
export function readableOn(bg: string): string {
  return luminance(bg) > 0.58 ? "#111111" : "#FFFFFF";
}

/** 브라우저: 파일/URL 이미지를 64px 로 줄여 주요 색을 뽑는다. 실패하면 빈 배열 */
export async function extractPalette(src: Blob | string, count = 5): Promise<string[]> {
  try {
    const url = typeof src === "string" ? src : URL.createObjectURL(src);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image load failed"));
      el.src = url;
    });
    if (typeof src !== "string") URL.revokeObjectURL(url);
    const w = 64;
    const h = Math.max(1, Math.round((w * img.naturalHeight) / Math.max(1, img.naturalWidth)));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(img, 0, 0, w, h);
    return quantizePalette(ctx.getImageData(0, 0, w, h).data, count);
  } catch {
    return [];
  }
}
