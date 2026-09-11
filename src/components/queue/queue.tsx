"use client";

import Link from "next/link";
import { RotateCcw, XCircle } from "lucide-react";
import type { IndexEntry, PostStatus } from "@/types";
import { usePosts } from "@/lib/client/queries";
import { useChannel, CHANNEL_META } from "@/lib/client/channel";
import { api } from "@/lib/client/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/page-header";
import { StatusBadge } from "@/components/library/status-badge";
import { Button } from "@/components/ui/button";
import { fmtTime } from "@/components/dashboard/dashboard";

const GROUPS: { status: PostStatus; title: string; hint: string }[] = [
  { status: "publishing", title: "게시 중", hint: "락이 10분 이상이면 재시도 가능" },
  { status: "scheduled", title: "예약", hint: "run_at 이후 외부 핑거가 실행" },
  { status: "failed", title: "실패", hint: "수동 재시도 · 최대 3회" },
  { status: "approved", title: "승인 (게시 대기)", hint: "게시 화면에서 즉시/예약" },
];

export function Queue() {
  const [channel] = useChannel();
  const posts = usePosts(channel ? { channel } : {});
  const qc = useQueryClient();
  const retry = useMutation({
    mutationFn: (id: string) => api.retry(id),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["posts"] });
      if (r.ok) toast.success("재게시 완료");
      else toast.error(`실패: ${r.error ?? ""}`);
    },
    onError: (e) => { void qc.invalidateQueries({ queryKey: ["posts"] }); toast.error(e instanceof Error ? e.message : String(e)); },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.transition(id, "approved"),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["posts"] }); toast.success("예약 취소"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  const all = posts.data?.posts ?? [];

  return (
    <>
      <PageHeader title="게시 큐" description="자동 게시는 없습니다. 모든 게시는 여기서 또는 게시 화면에서 사용자가 시작합니다." />
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {GROUPS.map((g) => {
          const items = all.filter((p) => p.status === g.status).sort((a, b) => (a.scheduled_at ?? a.updated_at).localeCompare(b.scheduled_at ?? b.updated_at));
          return (
            <section key={g.status} className="mb-6">
              <div className="mb-2 flex items-baseline gap-2">
                <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">{g.title}</h2>
                <span className="text-xs text-muted-foreground">{items.length} · {g.hint}</span>
              </div>
              {items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">없음</div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border">
                  {items.map((p) => (
                    <Row key={p.post_id} post={p} onRetry={() => retry.mutate(p.post_id)} onCancel={() => cancel.mutate(p.post_id)} busy={retry.isPending || cancel.isPending} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

function Row({ post, onRetry, onCancel, busy }: { post: IndexEntry; onRetry: () => void; onCancel: () => void; busy: boolean }) {
  const stale = post.warnings.includes("stale_lock");
  return (
    <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3 last:border-0">
      <span className="w-10 text-xs font-bold" style={{ color: CHANNEL_META[post.channel].color }}>{post.channel}</span>
      <Link href={`/publish/${encodeURIComponent(post.post_id)}`} className="min-w-0 flex-1 hover:underline">
        <div className="truncate text-sm font-medium">{post.headline.split("\n")[0] || post.post_id}</div>
        <div className="truncate text-xs text-muted-foreground">
          {post.post_id}
          {post.scheduled_at && ` · 예약 ${fmtTime(post.scheduled_at)}`}
          {post.last_error && ` · ${post.last_error}`}
        </div>
      </Link>
      <StatusBadge status={post.status} />
      {post.status === "scheduled" && (
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}><XCircle className="size-3.5" /> 취소</Button>
      )}
      {(post.status === "failed" || (post.status === "publishing" && stale)) && (
        <Button size="sm" variant="outline" onClick={onRetry} disabled={busy}><RotateCcw className="size-3.5" /> 재시도</Button>
      )}
    </div>
  );
}
