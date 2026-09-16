"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bookmark, Eye, RefreshCw, Users } from "lucide-react";
import type { AccountDay, AccountKey, AccountSummary, InsightsRange, MediaRow, MetricDelta, PublicAccount } from "@/types";
import { useCollectInsights, useInsights } from "@/lib/client/queries";
import { accountMeta, useAccountList, useChannelMeta } from "@/lib/client/channel";
import { ImagePlaceholder } from "@/components/md/placeholder";
import { CardGridSkeleton, Skeleton } from "@/components/md/skeleton";
import { driveFileUrl } from "@/lib/client/api";
import { fmtDay, fmtRelative } from "@/lib/client/format";
import { pctChange } from "@/lib/insights/summarize";
import { Segmented } from "@/components/md/segmented";
import { cn } from "@/lib/utils";

type TopMetric = "views" | "saves" | "reach" | "total_interactions";
const TOP_METRIC_LABEL: Record<TopMetric, string> = { views: "조회", saves: "저장", reach: "도달", total_interactions: "반응" };

const RANGE_LABEL: Record<InsightsRange, string> = { "7": "7일", "28": "28일", "90": "90일" };

/** 홈 "성과" 탭 — 선택 계정 요약 · 추이 · TOP 게시물 · 계정 간 비교. 데이터는 Drive 스냅샷. */
export function InsightsBoard({ channel }: { channel: AccountKey }) {
  const [range, setRange] = useState<InsightsRange>("28");
  const [topMetric, setTopMetric] = useState<TopMetric>("views");
  const insights = useInsights(range);
  const collect = useCollectInsights();
  const meta = useChannelMeta(channel);
  const { accounts: connected } = useAccountList();
  const now = insights.dataUpdatedAt;

  const mine = insights.data?.accounts.find((a) => a.channel === channel) ?? null;
  const top = useMemo(() => {
    const rows = (insights.data?.media ?? []).filter((m) => m.channel === channel);
    return [...rows].sort((a, b) => b[topMetric] - a[topMetric]).slice(0, 6);
  }, [insights.data, channel, topMetric]);

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="w-[240px]">
          <Segmented size="medium" value={range} onChange={setRange} items={(["7", "28", "90"] as const).map((r) => ({ value: r, label: RANGE_LABEL[r] }))} />
        </div>
        <div className="flex items-center gap-3 text-[13px] text-label-alt">
          <span>{mine?.last_collected_at ? `${fmtRelative(mine.last_collected_at, now)} 수집` : "수집 기록 없음"}</span>
          <button
            type="button"
            onClick={() => collect.mutate()}
            disabled={collect.isPending}
            className="flex h-[34px] items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-label-neutral hairline hover:bg-fill-alt disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3.5", collect.isPending && "animate-spin")} />
            {collect.isPending ? "수집 중…" : "지금 수집"}
          </button>
        </div>
      </div>

      {insights.isLoading ? (
        <div className="flex flex-col gap-5" aria-busy>
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex h-[112px] flex-col justify-between rounded-2xl bg-surface p-4">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
          <Skeleton className="h-[220px] rounded-2xl" />
          <CardGridSkeleton count={4} />
        </div>
      ) : !mine || (mine.series.length === 0 && mine.followers.value === 0) ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface px-5 py-[100px] text-center">
          <p className="max-w-[360px] text-[15px] leading-normal text-label-alt">
            아직 @{meta.handle} 계정의 인사이트가 없어요. 설정에서 Instagram 비즈니스 계정을 연결하고 &ldquo;지금 수집&rdquo;을 누르면 여기 쌓여요.
          </p>
          <Link href="/settings/accounts" className="text-[13px] font-semibold text-brand">
            계정 연결 →
          </Link>
        </div>
      ) : (
        <>
          {mine.last_error && (
            <div className="rounded-xl px-4 py-3 text-[13px] text-negative" style={{ background: "var(--semantic-background-status-negative)" }}>
              마지막 수집 실패 · {mine.last_error}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatTile label="팔로워" icon={Users} d={mine.followers} series={mine.series} k="followers" color={meta.color} cumulative />
            <StatTile label="도달" icon={Eye} d={mine.reach} series={mine.series} k="reach" color={meta.color} />
            <StatTile label="조회수" d={mine.views} series={mine.series} k="views" color={meta.color} />
            <StatTile label="프로필 방문" d={mine.profile_views} series={mine.series} k="profile_views" color={meta.color} />
          </div>

          <section className="rounded-2xl bg-surface p-5 hairline">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-[15px] font-semibold">일별 도달 · {RANGE_LABEL[range]}</h2>
              <span className="text-[13px] text-label-alt">
                게시물 {mine.posts_in_range} · 게시물당 평균 도달 {fmtNum(mine.avg_reach_per_post)} · 저장률 {fmtPct(mine.save_rate)}
              </span>
            </div>
            <AreaChart series={mine.series} k="reach" color={meta.color} height={160} />
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">TOP 게시물</h2>
              <div className="w-[260px]">
                <Segmented value={topMetric} onChange={setTopMetric} items={(Object.keys(TOP_METRIC_LABEL) as TopMetric[]).map((k) => ({ value: k, label: TOP_METRIC_LABEL[k] }))} />
              </div>
            </div>
            {top.length === 0 ? (
              <div className="rounded-2xl bg-surface px-5 py-12 text-center text-[14px] text-label-alt">게시된 포스트의 지표가 아직 없어요.</div>
            ) : (
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
                {top.map((m, i) => (
                  <TopCard key={m.ig_media_id} m={m} rank={i + 1} metric={topMetric} />
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-surface p-5 hairline">
            <h2 className="mb-4 text-[15px] font-semibold">채널 비교 · {RANGE_LABEL[range]}</h2>
            <ChannelCompare connected={connected} accounts={insights.data?.accounts ?? []} current={channel} />
          </section>
        </>
      )}
    </div>
  );
}

// ---------- 조각 ----------

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString("ko-KR");
}
function fmtPct(r: number | null, signed = false): string {
  if (r === null) return "—";
  const v = (r * 100).toFixed(1);
  return signed && r > 0 ? `+${v}%` : `${v}%`;
}

function StatTile({
  label,
  icon: Icon,
  d,
  series,
  k,
  color,
  cumulative,
}: {
  label: string;
  icon?: typeof Users;
  d: MetricDelta;
  series: AccountDay[];
  k: keyof Omit<AccountDay, "date">;
  color: string;
  /** 팔로워처럼 누적값이면 증감 = 최신 − 직전 기간 말 */
  cumulative?: boolean;
}) {
  const pct = pctChange(d);
  const diff = d.previous === null ? null : d.value - d.previous;
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-surface p-4 hairline">
      <div className="flex items-center justify-between text-[13px] text-label-alt">
        <span>{label}</span>
        {Icon && <Icon className="size-4 opacity-50" />}
      </div>
      <div className="text-[28px] font-bold leading-none tracking-[-0.02em] tabular-nums">{fmtNum(d.value)}</div>
      <div className={cn("flex items-center gap-1.5 text-[12px] tabular-nums", pct === null ? "text-label-assistive" : pct >= 0 ? "text-positive" : "text-negative")}>
        {pct === null ? "비교 데이터 없음" : `${fmtPct(pct, true)} · ${diff! >= 0 ? "+" : ""}${fmtNum(diff!)}`}
        <span className="text-label-assistive">{cumulative ? "직전 기간 말 대비" : "직전 기간 대비"}</span>
      </div>
      <AreaChart series={series} k={k} color={color} height={36} bare />
    </div>
  );
}

/** 의존성 없는 인라인 SVG 영역 차트. bare=true 면 축·라벨 없이 스파크라인. */
function AreaChart({ series, k, color, height, bare }: { series: AccountDay[]; k: keyof Omit<AccountDay, "date">; color: string; height: number; bare?: boolean }) {
  const w = 600;
  const padX = bare ? 0 : 4;
  const padTop = bare ? 2 : 8;
  const padBottom = bare ? 2 : 22;
  const vals = series.map((d) => d[k]);
  const max = Math.max(1, ...vals);
  const min = bare ? Math.min(...vals, max) : 0;
  const n = Math.max(1, vals.length - 1);
  const x = (i: number) => padX + (i / n) * (w - padX * 2);
  const y = (v: number) => padTop + (1 - (v - min) / Math.max(1, max - min)) * (height - padTop - padBottom);
  if (vals.length === 0) return <div style={{ height }} className="grid place-items-center text-[12px] text-label-assistive">{bare ? "" : "데이터 없음"}</div>;
  const line = vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(vals.length - 1).toFixed(1)},${(height - padBottom).toFixed(1)} L${x(0).toFixed(1)},${(height - padBottom).toFixed(1)} Z`;
  const gid = `g-${k}-${bare ? "s" : "l"}`;
  const ticks = bare ? [] : [0, Math.floor(series.length / 2), series.length - 1].filter((i, idx, a) => a.indexOf(i) === idx);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="block w-full" style={{ height }} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity={bare ? 0.18 : 0.28} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {!bare && [0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={padX} x2={w - padX} y1={y(max * f)} y2={y(max * f)} stroke="var(--semantic-line-solid-alternative)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={bare ? 1.5 : 2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {ticks.map((i) => (
        <text key={i} x={x(i)} y={height - 6} fontSize={11} fill="var(--semantic-label-alternative)" textAnchor={i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"} style={{ fontFamily: "inherit" }}>
          {fmtDay(series[i].date)}
        </text>
      ))}
    </svg>
  );
}

function TopCard({ m, rank, metric }: { m: MediaRow; rank: number; metric: TopMetric }) {
  const href = m.post_id ? `/editor/${encodeURIComponent(m.post_id)}` : "#";
  return (
    <Link href={href} className="flex flex-col gap-2 transition-transform duration-200 hover:-translate-y-[3px]">
      <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-fill-alt hairline-neutral">
        {m.cover_thumb_file_id ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={driveFileUrl(m.cover_thumb_file_id)} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <ImagePlaceholder label={m.headline.split("\n")[0]} />
        )}
        <span className="absolute left-2.5 top-2.5 grid size-6 place-items-center rounded-full bg-white text-[12px] font-bold text-black">{rank}</span>
        <div className="absolute inset-x-0 bottom-0 px-3 pb-2.5 pt-8 text-white" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.6), rgba(0,0,0,0))" }}>
          <div className="text-[20px] font-bold leading-none tabular-nums">{fmtNum(m[metric])}</div>
          <div className="text-[11px] opacity-80">{TOP_METRIC_LABEL[metric]}</div>
        </div>
      </div>
      <p className="m-0 line-clamp-2 text-[14px] font-semibold leading-[1.35]">{m.headline.split("\n")[0] || m.ig_media_id}</p>
      <div className="flex items-center gap-2 text-[12px] text-label-alt tabular-nums">
        <span className="flex items-center gap-1"><Eye className="size-3" />{fmtNum(m.reach)}</span>
        <span className="flex items-center gap-1"><Bookmark className="size-3" />{fmtNum(m.saves)}</span>
        <span className="ml-auto">{fmtDay(m.published_at)}</span>
      </div>
    </Link>
  );
}

function ChannelCompare({ connected, accounts, current }: { connected: PublicAccount[]; accounts: AccountSummary[]; current: AccountKey }) {
  const rows = connected.map((acc) => ({ ch: acc.key, c: accountMeta(acc), a: accounts.find((x) => x.channel === acc.key) ?? null }));
  const maxReach = Math.max(1, ...rows.map((r) => r.a?.reach.value ?? 0));
  return (
    <div className="grid gap-x-6 gap-y-2 text-[13px]" style={{ gridTemplateColumns: "auto 1fr auto auto auto" }}>
      <div className="contents text-[12px] text-label-alt">
        <span>채널</span><span>도달</span><span className="text-right">팔로워</span><span className="text-right">게시물</span><span className="text-right">저장률</span>
      </div>
      {rows.map(({ ch, c, a }) => {
        const on = ch === current;
        return (
          <div key={ch} className={cn("contents", on ? "font-semibold" : "text-label-neutral")}>
            <span className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: c.color }} />{c.name}</span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-fill">
                <span className="block h-full rounded-full" style={{ width: `${((a?.reach.value ?? 0) / maxReach) * 100}%`, background: c.color, opacity: on ? 1 : 0.55 }} />
              </span>
              <span className="w-14 text-right tabular-nums">{fmtNum(a?.reach.value ?? 0)}</span>
            </span>
            <span className="text-right tabular-nums">{fmtNum(a?.followers.value ?? 0)}</span>
            <span className="text-right tabular-nums">{a?.posts_in_range ?? 0}</span>
            <span className="text-right tabular-nums">{fmtPct(a?.save_rate ?? 0)}</span>
          </div>
        );
      })}
    </div>
  );
}
