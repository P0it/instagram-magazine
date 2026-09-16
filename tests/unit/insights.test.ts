import { describe, expect, it } from "vitest";
import { InsightsFileSchema, type IndexEntry, type InsightsFile, type PublicAccount } from "@/types";
import { pctChange, summarizeInsights } from "@/lib/insights/summarize";

const NOW = Date.UTC(2026, 8, 16, 12); // 2026-09-16 12:00Z

function days(n: number, f: (i: number) => Partial<InsightsFile["days"][number]>): InsightsFile["days"] {
  return Array.from({ length: n }, (_, idx) => {
    const i = n - 1 - idx; // i = days ago
    const date = new Date(NOW - i * 86_400_000).toISOString().slice(0, 10);
    return { date, followers: 0, reach: 0, views: 0, profile_views: 0, ...f(i) };
  });
}

const accounts: PublicAccount[] = [
  {
    key: "life", ig_user_id: "1", username: "life", token_expires_at: "t", last_refreshed_at: "t", status: "connected",
    name: "라이프", color: "#000", drive_folder_id: "f", inbox_folder_id: "i", default_style_pack: null, default_presets_by_role: {},
    caption_template: "", default_hashtags: [], editorial_rules: { fact_check_required: false },
  },
];

const post = (id: string, published_at: string, ig_media_id: string): IndexEntry => ({
  post_id: id, channel: "life", status: "published", folder_status: "published", drive_folder_id: "f", headline: `H ${id}`, topic: "",
  content_type: "carousel", slide_count: 3, render_count: 3, cover_thumb_file_id: "t", fact_check_status: "approved", fact_check_required: false,
  scheduled_at: null, published_at, ig_media_id, account_key: "life", last_error: null, created_at: published_at, updated_at: published_at, warnings: [],
});

describe("summarizeInsights", () => {
  it("sums the range and the previous range, followers = latest vs end of previous range", () => {
    const file = InsightsFileSchema.parse({
      account_key: "life",
      days: days(14, (i) => ({ reach: i < 7 ? 100 : 50, followers: 1000 - i })),
    });
    const r = summarizeInsights({ files: [file], index: [], accounts, range: "7", now: NOW });
    const a = r.accounts[0];
    expect(a.channel).toBe("life");
    expect(a.username).toBe("life");
    expect(a.reach).toEqual({ value: 700, previous: 350 });
    expect(a.followers).toEqual({ value: 1000, previous: 993 });
    expect(a.series).toHaveLength(7);
    expect(pctChange(a.reach)).toBeCloseTo(1);
  });

  it("returns previous=null when there is no comparison data", () => {
    const file = InsightsFileSchema.parse({ account_key: "life", days: days(3, () => ({ reach: 10 })) });
    const a = summarizeInsights({ files: [file], index: [], accounts, range: "7", now: NOW }).accounts[0];
    expect(a.reach).toEqual({ value: 30, previous: null });
    expect(pctChange(a.reach)).toBeNull();
  });

  it("joins media rows to index posts and computes per-post averages in range", () => {
    const file = InsightsFileSchema.parse({
      account_key: "life",
      media: [
        { ig_media_id: "m1", post_id: "p1", reach: 1000, saves: 50, collected_at: "x" },
        { ig_media_id: "m2", post_id: "p2", reach: 500, saves: 10, collected_at: "x" },
        { ig_media_id: "old", post_id: "p3", reach: 9999, saves: 1, collected_at: "x" },
      ],
    });
    const index = [post("p1", "2026-09-15T00:00:00Z", "m1"), post("p2", "2026-09-10T00:00:00Z", "m2"), post("p3", "2026-01-01T00:00:00Z", "old")];
    const r = summarizeInsights({ files: [file], index, accounts, range: "28", now: NOW });
    const a = r.accounts[0];
    expect(a.posts_in_range).toBe(2);
    expect(a.avg_reach_per_post).toBe(750);
    expect(a.save_rate).toBeCloseTo(60 / 1500);
    expect(r.media.map((m) => m.post_id)).toEqual(["p1", "p2", "p3"]); // 최신순
    expect(r.media[0].headline).toBe("H p1");
    expect(r.media[0].cover_thumb_file_id).toBe("t");
  });

  it("exposes a snapshot of a disconnected account as channel=null", () => {
    const file = InsightsFileSchema.parse({ account_key: "orphan" });
    const a = summarizeInsights({ files: [file], index: [], accounts, range: "7", now: NOW }).accounts[0];
    expect(a.channel).toBeNull();
    expect(a.followers).toEqual({ value: 0, previous: null });
  });
});
