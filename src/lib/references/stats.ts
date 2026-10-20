import type { Reference } from "@/types";

export type RefSort = "recent" | "likes" | "rate" | "slides";
export const SORT_LABEL: Record<RefSort, string> = { recent: "최신순", likes: "좋아요순", rate: "반응률순", slides: "슬라이드 많은순" };

/** 좋아요 ÷ 팔로워 (%). 둘 다 알 때만. */
export function likeRate(r: Reference): number | null {
  const l = r.metrics?.likes, f = r.metrics?.followers;
  return l != null && f ? (l / f) * 100 : null;
}

export function sortRefs(list: Reference[], sort: RefSort): Reference[] {
  const key = (r: Reference): number =>
    sort === "likes" ? (r.metrics?.likes ?? -1) : sort === "rate" ? (likeRate(r) ?? -1) : sort === "slides" ? r.images.length : 0;
  return list.slice().sort((a, b) => (sort === "recent" ? b.created_at.localeCompare(a.created_at) : key(b) - key(a) || b.created_at.localeCompare(a.created_at)));
}

const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export interface HookStat { hook: string; count: number; avgLikes: number | null; avgRate: number | null }
export interface ColorStat { hex: string; count: number }

export interface RefStats {
  total: number;
  analyzed: number;
  avgSlides: number | null;
  hooks: HookStat[];
  density: Record<"low" | "mid" | "high", number>;
  colors: ColorStat[];
  /** 표본이 적을수록 단정하지 않기 위한 기준 */
  smallSample: boolean;
}

/** hex 를 거칠게 묶어(채널당 32 단위) 비슷한 색을 한 덩어리로 센다 */
function bucket(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const q = (v: number) => Math.min(255, Math.round(v / 32) * 32);
  const r = q((n >> 16) & 255), g = q((n >> 8) & 255), b = q(n & 255);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function computeStats(refs: Reference[]): RefStats {
  const analyzed = refs.filter((r) => r.insight);
  const byHook = new Map<string, Reference[]>();
  for (const r of analyzed) {
    const k = r.insight!.marketer.hook_type;
    byHook.set(k, [...(byHook.get(k) ?? []), r]);
  }
  const hooks = [...byHook.entries()]
    .map(([hook, rs]) => ({
      hook,
      count: rs.length,
      avgLikes: avg(rs.map((r) => r.metrics?.likes).filter((x): x is number => x != null)),
      avgRate: avg(rs.map(likeRate).filter((x): x is number => x != null)),
    }))
    .sort((a, b) => b.count - a.count);
  const density = { low: 0, mid: 0, high: 0 };
  const colors = new Map<string, number>();
  for (const r of analyzed) {
    density[r.insight!.uiux.density]++;
    for (const c of new Set(r.insight!.uiux.palette.map(bucket))) colors.set(c, (colors.get(c) ?? 0) + 1);
  }
  return {
    total: refs.length,
    analyzed: analyzed.length,
    avgSlides: avg(refs.map((r) => r.images.length)),
    hooks,
    density,
    colors: [...colors.entries()].map(([hex, count]) => ({ hex, count })).sort((a, b) => b.count - a.count).slice(0, 12),
    smallSample: analyzed.length < 10,
  };
}
