import type Konva from "konva";

/** 색온도: warmth(−100..100) 만큼 R 을 올리고 B 를 내린다 (Uint8ClampedArray 라 자동 클램프) */
export function applyWarmth(data: Uint8ClampedArray, warmth: number): void {
  if (!warmth) return;
  const f = warmth / 100;
  const dr = 34 * f;
  const dg = 6 * f;
  const db = -34 * f;
  for (let i = 0; i < data.length; i += 4) {
    data[i] += dr;
    data[i + 1] += dg;
    data[i + 2] += db;
  }
}

/** 페이드: 블랙 포인트를 lift 까지 들어 올리고 화이트는 유지 */
export function applyFade(data: Uint8ClampedArray, fade: number): void {
  if (!fade) return;
  const lift = 70 * (fade / 100);
  const gain = (255 - lift) / 255;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lift + data[i] * gain;
    data[i + 1] = lift + data[i + 1] * gain;
    data[i + 2] = lift + data[i + 2] * gain;
  }
}

/** Konva 커스텀 필터. 값은 노드 attr(warmth/fade)로 받는다 */
export const warmthFilter: Konva.Filter = function (this: Konva.Node, imageData) {
  applyWarmth(imageData.data, (this.getAttr("warmth") as number | undefined) ?? 0);
};

export const fadeFilter: Konva.Filter = function (this: Konva.Node, imageData) {
  applyFade(imageData.data, (this.getAttr("fade") as number | undefined) ?? 0);
};
