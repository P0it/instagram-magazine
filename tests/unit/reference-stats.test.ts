import { describe, expect, it } from "vitest";
import { computeStats, likeRate, sortRefs } from "@/lib/references/stats";
import { ReferenceSchema, type Reference } from "@/types";

const mk = (id: string, over: Partial<Reference> = {}): Reference =>
  ReferenceSchema.parse({ id: `ref-${id}`, title: id, created_at: `2026-10-0${id}T00:00:00Z`, updated_at: "x", images: [{ name: "1.png", fileId: "f" }], ...over });

const insight = (hook: string, density = "low", palette: string[] = []) => ({
  curator: { topic: "t", angle: "a", tone: "x", takeaway: "y" },
  marketer: { hook_type: hook, hook_note: "", structure: "", cta: "", save_trigger: "" },
  uiux: { cover_layout: "", body_layout: "", typography: "", palette, density },
  why: [], reuse: [], analyzed_at: "x", provider: "cli",
});

describe("reference stats", () => {
  it("likeRate needs both likes and followers", () => {
    expect(likeRate(mk("1", { metrics: { likes: 50 } }))).toBeNull();
    expect(likeRate(mk("1", { metrics: { likes: 50, followers: 1000 } }))).toBe(5);
  });

  it("sorts by likes, rate and slide count, unknown last", () => {
    const a = mk("1", { metrics: { likes: 10, followers: 100 } });
    const b = mk("2", { metrics: { likes: 99, followers: 10000 } });
    const c = mk("3");
    expect(sortRefs([a, b, c], "likes").map((r) => r.title)).toEqual(["2", "1", "3"]);
    expect(sortRefs([a, b, c], "rate").map((r) => r.title)).toEqual(["1", "2", "3"]);
    expect(sortRefs([a, b, c], "recent").map((r) => r.title)).toEqual(["3", "2", "1"]);
  });

  it("aggregates hooks, density and similar colours", () => {
    const refs = [
      mk("1", { insight: insight("number", "low", ["#F5D04E", "#000000"]) as never, metrics: { likes: 100 } }),
      mk("2", { insight: insight("number", "mid", ["#F6D14F"]) as never, metrics: { likes: 300 } }),
      mk("3", { insight: insight("curiosity", "low") as never }),
      mk("4"),
    ];
    const s = computeStats(refs);
    expect(s.total).toBe(4);
    expect(s.analyzed).toBe(3);
    expect(s.hooks[0]).toMatchObject({ hook: "number", count: 2, avgLikes: 200 });
    expect(s.density).toEqual({ low: 2, mid: 1, high: 0 });
    expect(s.colors[0]!.count).toBe(2); // 비슷한 노랑 두 개가 한 덩어리
    expect(s.smallSample).toBe(true);
  });
});
