"use client";

import Link from "next/link";
import { ChevronLeft, RotateCcw, XCircle } from "lucide-react";
import type { IndexEntry, PostStatus } from "@/types";
import { usePosts } from "@/lib/client/queries";
import { useAccountList, useChannel, useChannelMeta } from "@/lib/client/channel";
import { NoAccounts } from "@/components/shell/no-accounts";
import { api } from "@/lib/client/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { StatusBadge } from "@/components/library/status-badge";
import { fmtTime } from "@/lib/client/format";

const GROUPS: { status: PostStatus; title: string; hint: string }[] = [
  { status: "publishing", title: "게시 중", hint: "락이 10분 이상이면 재시도 가능" },
  { status: "scheduled", title: "예약", hint: "run_at 이후 외부 핑거가 실행" },
  { status: "failed", title: "실패", hint: "수동 재시도 · 최대 3회" },
  { status: "approved", title: "게시 준비됨", hint: "빌더에서 게시 버튼으로 시작" },
];

/** 게시 큐 — 예약·실패·진행 중 항목만. 자동 게시는 없다. */
export function Queue() {
  const [channel] = useChannel();
  const { accounts, isLoading: accountsLoading } = useAccountList();
  const meta = useChannelMeta(channel);
  const posts = usePosts({ channel: channel ?? undefined }, Boolean(channel));
  const qc = useQueryClient();
  const retry = useMutation({
    mutationFn: (id: string) => api.retry(id),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["posts"] });
      if (r.ok) toast.success("다시 게시했어요.");
      else toast.error(`실패: ${r.error ?? ""}`);
    },
    onError: (e) => { void qc.invalidateQueries({ queryKey: ["posts"] }); toast.error(e instanceof Error ? e.message : String(e)); },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.transition(id, "approved"),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["posts"] }); toast.success("예약을 취소했어요."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  const all = posts.data?.posts ?? [];

  if (!accountsLoading && accounts.length === 0) return <NoAccounts />;
  if (!channel) return <div className="flex-1" />;

  return (
    <div className="mx-auto box-border flex w-full max-w-[900px] flex-1 flex-col gap-7 overflow-auto px-5 pb-20 pt-8">
      <div className="flex items-center gap-2.5">
        <Link href={`/home?ch=${channel}`} className="grid size-8 place-items-center rounded-full hover:bg-fill" title="홈으로"><ChevronLeft className="size-5 opacity-70" /></Link>
        <span className="size-2 rounded-full" style={{ background: meta.color }} />
        <h1 className="m-0 text-2xl font-bold leading-8 tracking-[-0.023em]">게시 큐 · {meta.name}</h1>
        <span className="text-[13px] text-label-alt">자동 게시는 없어요. 모든 게시는 빌더에서 시작해요.</span>
      </div>
      {GROUPS.map((g) => {
        const items = all.filter((p) => p.status === g.status).sort((a, b) => (a.scheduled_at ?? a.updated_at).localeCompare(b.scheduled_at ?? b.updated_at));
        return (
          <section key={g.status} className="overflow-hidden rounded-2xl bg-surface">
            <div className="flex items-baseline gap-2 px-5 pb-2.5 pt-[18px]">
              <h2 className="m-0 text-[17px] font-semibold">{g.title}</h2>
              <span className="text-[13px] text-label-alt">{items.length} · {g.hint}</span>
            </div>
            {items.length === 0 ? (
              <div className="px-5 pb-5 text-[13px] text-label-assistive">없음</div>
            ) : (
              items.map((p) => <Row key={p.post_id} post={p} onRetry={() => retry.mutate(p.post_id)} onCancel={() => cancel.mutate(p.post_id)} busy={retry.isPending || cancel.isPending} />)
            )}
          </section>
        );
      })}
    </div>
  );
}

function Row({ post, onRetry, onCancel, busy }: { post: IndexEntry; onRetry: () => void; onCancel: () => void; busy: boolean }) {
  const stale = post.warnings.includes("stale_lock");
  return (
    <div className="flex items-center gap-3.5 px-5 py-3.5" style={{ boxShadow: "inset 0 1px 0 var(--semantic-line-solid-alternative)" }}>
      <Link href={`/publish/${encodeURIComponent(post.post_id)}`} className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate text-[15px] font-semibold">{post.headline.split("\n")[0] || post.post_id}</span>
        <span className="truncate text-[13px] text-label-alt">
          {post.post_id}
          {post.scheduled_at && ` · 예약 ${fmtTime(post.scheduled_at)}`}
          {post.last_error && ` · ${post.last_error}`}
        </span>
      </Link>
      <StatusBadge status={post.status} />
      {post.status === "scheduled" && (
        <button type="button" onClick={onCancel} disabled={busy} className="flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-semibold text-label-neutral hover:bg-fill-alt disabled:opacity-50"><XCircle className="size-3.5" /> 취소</button>
      )}
      {(post.status === "failed" || (post.status === "publishing" && stale)) && (
        <button type="button" onClick={onRetry} disabled={busy} className="flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-semibold text-brand hover:bg-fill-alt disabled:opacity-50"><RotateCcw className="size-3.5" /> 재시도</button>
      )}
    </div>
  );
}
