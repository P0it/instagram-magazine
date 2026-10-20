/** 캐러셀 현재 장을 delta 만큼 옮기되 0..count-1 안에 가둔다. 장이 없거나 1장이면 0. */
export function stepSlide(index: number, delta: number, count: number): number {
  if (count <= 1) return 0;
  return Math.min(count - 1, Math.max(0, index + delta));
}
