import type { AccountDay, AccountSummary, ChannelConfig, IndexEntry, InsightsFile, InsightsRange, InsightsResponse, MediaRow, MetricDelta, PublicAccount } from "@/types";

/** 순수 집계. Drive 접근 없음 → 단위 테스트 대상. */

function dateOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

function sum(days: AccountDay[], key: keyof Omit<AccountDay, "date">): number {
  return days.reduce((a, d) => a + d[key], 0);
}

function delta(value: number, previous: number | null): MetricDelta {
  return { value, previous };
}

export function pctChange(d: MetricDelta): number | null {
  if (d.previous === null || d.previous === 0) return null;
  return (d.value - d.previous) / d.previous;
}

export interface SummarizeInput {
  files: InsightsFile[];
  index: IndexEntry[];
  channels: ChannelConfig[];
  accounts: PublicAccount[];
  range: InsightsRange;
  now: number;
}

export function summarizeInsights(input: SummarizeInput): InsightsResponse {
  const n = Number(input.range);
  const today = dateOf(input.now);
  const from = dateOf(input.now - (n - 1) * 86_400_000);
  const prevFrom = dateOf(input.now - (2 * n - 1) * 86_400_000);
  const prevTo = dateOf(input.now - n * 86_400_000);

  const channelOf = new Map<string, ChannelConfig>();
  for (const c of input.channels) if (c.instagram_account_key) channelOf.set(c.instagram_account_key, c);
  const accountOf = new Map(input.accounts.map((a) => [a.key, a]));
  const postOf = new Map(input.index.map((p) => [p.post_id, p]));

  const media: MediaRow[] = [];
  const accounts: AccountSummary[] = input.files.map((file) => {
    const channel = channelOf.get(file.account_key) ?? null;
    const series = file.days.filter((d) => inRange(d.date, from, today));
    const prev = file.days.filter((d) => inRange(d.date, prevFrom, prevTo));
    const latestFollowers = file.days.length ? file.days[file.days.length - 1].followers : 0;
    const prevFollowers = prev.length ? prev[prev.length - 1].followers : null;

    const rows: MediaRow[] = [];
    for (const m of file.media) {
      const post = m.post_id ? postOf.get(m.post_id) : undefined;
      rows.push({
        ...m,
        channel: post?.channel ?? channel?.key ?? "LIFE",
        account_key: file.account_key,
        headline: post?.headline ?? "",
        cover_thumb_file_id: post?.cover_thumb_file_id ?? null,
        published_at: post?.published_at ?? null,
      });
    }
    media.push(...rows);
    const inRangeRows = rows.filter((r) => r.published_at && inRange(r.published_at.slice(0, 10), from, today));
    const reachSum = inRangeRows.reduce((a, r) => a + r.reach, 0);
    const savesSum = inRangeRows.reduce((a, r) => a + r.saves, 0);

    return {
      account_key: file.account_key,
      channel: channel?.key ?? null,
      username: accountOf.get(file.account_key)?.username ?? null,
      last_collected_at: file.last_collected_at,
      last_error: file.last_error,
      followers: delta(latestFollowers, prevFollowers),
      reach: delta(sum(series, "reach"), prev.length ? sum(prev, "reach") : null),
      views: delta(sum(series, "views"), prev.length ? sum(prev, "views") : null),
      profile_views: delta(sum(series, "profile_views"), prev.length ? sum(prev, "profile_views") : null),
      series,
      posts_in_range: inRangeRows.length,
      avg_reach_per_post: inRangeRows.length ? Math.round(reachSum / inRangeRows.length) : 0,
      save_rate: reachSum ? savesSum / reachSum : 0,
    };
  });

  media.sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
  return { generated_at: new Date(input.now).toISOString(), range: input.range, accounts, media };
}
