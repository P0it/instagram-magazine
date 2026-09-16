"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FileText, Heart, Layers2 } from "lucide-react";
import type { IndexEntry } from "@/types";
import { usePosts, useSync, useSystemStatus } from "@/lib/client/queries";
import { CHANNEL_META, channelGround, useChannel } from "@/lib/client/channel";
import { driveFileUrl } from "@/lib/client/api";
import { fmtDay, fmtRelative } from "@/lib/client/format";
import { STAGES, STAGE_LABEL, needsAttention, stageOfEntry, type Stage } from "@/lib/metadata/stage";
import { Segmented } from "@/components/md/segmented";
import { cn } from "@/lib/utils";

type Sort = "newest" | "oldest";

/** 목업 S-01 홈 보드: 초안 → 편집 중 → 게시됨 3단계 */
export function HomeBoard() {
  const [channel] = useChannel();
  const posts = usePosts({ channel });
  const status = useSystemStatus();
  const sync = useSync();
  const [tab, setTab] = useState<Stage>("inbox");
  const [sort, setSort] = useState<Sort>("newest");
  const meta = CHANNEL_META[channel];
  const now = posts.dataUpdatedAt;

  const grouped = useMemo(() => {
    const all = posts.data?.posts ?? [];
    const out: Record<Stage, IndexEntry[]> = { inbox: [], editing: [], published: [] };
    for (const p of all) out[stageOfEntry(p)].push(p);
    const key = (p: IndexEntry) => p.published_at ?? p.updated_at;
    for (const s of STAGES) out[s].sort((a, b) => (sort === "newest" ? key(b).localeCompare(key(a)) : key(a).localeCompare(key(b))));
    return out;
  }, [posts.data, sort]);

  const list = grouped[tab];
  const account = status.data?.accounts.find((a) => a.key === status.data?.channels.find((c) => c.key === channel)?.instagram_account_key);
  const handle = account?.username ?? meta.handle;

  return (
    <div className="mx-auto box-border w-full max-w-[1560px] flex-1 overflow-auto px-10 pb-16 pt-7">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <span className="size-[9px] rounded-full" style={{ background: meta.color }} />
            <h1 className="text-2xl font-bold leading-8 tracking-[-0.023em]">{meta.title}</h1>
          </div>
          <div className="w-[340px] max-w-full">
            <Segmented
              size="medium"
              value={tab}
              onChange={setTab}
              items={STAGES.map((s) => ({ value: s, label: `${STAGE_LABEL[s]} ${grouped[s].length}` }))}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="h-11 w-[140px] rounded-xl border-0 bg-surface px-3 text-sm outline-none hairline"
          >
            <option value="newest">최신순</option>
            <option value="oldest">오래된 순</option>
          </select>
        </div>
      </div>

      {posts.isLoading ? (
        <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[4/5] animate-pulse rounded-xl bg-fill" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-3.5 rounded-2xl bg-surface px-5 py-[120px]">
          <div className="grid h-[110px] w-[88px] place-items-center rounded-xl bg-fill">
            <FileText className="size-7 opacity-35" />
          </div>
          <p className="max-w-[320px] text-center text-[15px] leading-normal text-label-alt">
            {tab === "inbox" ? "ChatGPT 작업이 Drive에 초안을 넣으면 여기 나타나요." : tab === "editing" ? "초안을 열어 편집하면 여기로 옮겨와요." : "게시한 포스트가 여기 쌓여요."}
          </p>
          {tab === "inbox" && (
            <button type="button" onClick={() => sync.mutate()} disabled={sync.isPending} className="h-[34px] rounded-lg px-3 text-[13px] font-semibold text-label-neutral hairline hover:bg-fill-alt disabled:opacity-50">
              {sync.isPending ? "새로고침 중…" : "Drive 새로고침"}
            </button>
          )}
        </div>
      ) : tab === "published" ? (
        <div className="max-w-[900px]">
          <div className="flex items-center gap-4 px-1 pb-6 pt-5">
            <div className="grid size-14 place-items-center rounded-full text-xl font-bold text-white" style={{ background: meta.color }}>
              {channel[0]}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[17px] font-semibold">@{handle}</span>
              <span className="text-[13px] text-label-alt">게시물 {list.length} · 톤 일관성 확인용 그리드</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {list.map((p, i) => (
              <Link key={p.post_id} href={`/editor/${encodeURIComponent(p.post_id)}`} className="relative aspect-square overflow-hidden" style={{ background: channelGround(meta.color, i) }}>
                {p.cover_thumb_file_id && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={driveFileUrl(p.cover_thumb_file_id)} alt="" className="size-full object-cover" loading="lazy" />
                )}
                <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.4), rgba(0,0,0,0) 60%)" }} />
                <p className="absolute inset-x-3 bottom-3 m-0 text-sm font-semibold leading-tight text-white">{p.headline.split("\n")[0]}</p>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
          {list.map((p, i) => (
            <HomeCard key={p.post_id} post={p} index={i} stage={tab} now={now} color={meta.color} />
          ))}
        </div>
      )}
    </div>
  );
}

function cardMeta(p: IndexEntry, stage: Stage, now: number): string {
  if (p.status === "needs_repair") return "확인 필요 · 필수값 누락";
  if (p.status === "failed") return `확인 필요 · ${p.last_error ?? "게시 실패"}`;
  if (p.warnings.includes("status_mismatch")) return "확인 필요 · 상태 불일치";
  if (p.status === "publishing") return "게시 중…";
  if (p.status === "scheduled") return `${fmtDay(p.scheduled_at)} 예약`;
  if (p.status === "approved") return "게시 준비됨";
  if (stage === "inbox") return `${fmtDay(p.created_at)} 도착`;
  return `${fmtRelative(p.updated_at, now)} 저장`;
}

function HomeCard({ post, index, stage, now, color }: { post: IndexEntry; index: number; stage: Stage; now: number; color: string }) {
  const attention = needsAttention(post);
  const cover = post.headline.split("\n")[0];
  return (
    <Link
      href={`/editor/${encodeURIComponent(post.post_id)}`}
      className="flex cursor-pointer flex-col gap-2.5 transition-transform duration-200 hover:-translate-y-[3px]"
      style={{ transitionTimingFunction: "cubic-bezier(0.4,0,0.2,1)" }}
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-xl hairline-neutral" style={{ background: channelGround(color, index) }}>
        {post.cover_thumb_file_id && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={driveFileUrl(post.cover_thumb_file_id)} alt="" className="size-full object-cover" loading="lazy" />
        )}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.42), rgba(0,0,0,0) 62%)" }} />
        {/* 렌더가 있으면 텍스트가 이미 그려져 있으니 겹치지 않는다 */}
        {post.render_count === 0 && (
          <p className="absolute inset-x-4 bottom-4 m-0 text-[17px] font-bold leading-[1.3] tracking-[-0.01em] text-white">{cover.length > 16 ? `${cover.slice(0, 14)}…` : cover}</p>
        )}
        {post.content_type === "carousel" && (
          <span className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-white backdrop-blur-[32px]" style={{ background: "rgba(23,23,25,0.52)" }}>
            <Layers2 className="size-3" /> {post.slide_count}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="m-0 line-clamp-2 text-[15px] font-semibold leading-[1.35]">{post.headline || post.post_id}</p>
        <div className={cn("flex items-center gap-1.5 text-[13px]", attention ? "text-negative" : "text-label-alt")}>
          {attention && <span className="size-1.5 shrink-0 rounded-full bg-negative" />}
          {stage === "published" && <Heart className="size-3.5 opacity-50" />}
          <span className="truncate">{cardMeta(post, stage, now)}</span>
        </div>
      </div>
    </Link>
  );
}
