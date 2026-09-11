"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Inbox, Send, Wrench } from "lucide-react";
import { CHANNEL_KEYS, type ChannelKey, type IndexEntry, type PostStatus } from "@/types";
import { usePosts, useSystemStatus } from "@/lib/client/queries";
import { CHANNEL_META, useChannel } from "@/lib/client/channel";
import { STATUS_LABEL } from "@/lib/metadata/transitions";
import { PageHeader } from "@/components/shell/page-header";
import { PostCard } from "@/components/library/post-card";
import { StatusBadge } from "@/components/library/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DAILY_LIMIT = 100;

export function Dashboard() {
  const [channel] = useChannel();
  const posts = usePosts(channel ? { channel } : {});
  const status = useSystemStatus();
  const all = posts.data?.posts ?? [];
  // react-query 가 기록한 마지막 fetch 시각을 "현재" 로 사용 (렌더 중 Date.now() 회피, 하이드레이션 안정)
  const now = posts.dataUpdatedAt;

  const byStatus = countBy(all, (p) => p.status);
  const last24h = now ? all.filter((p) => p.published_at && now - Date.parse(p.published_at) < 86_400_000).length : 0;
  const dueToday = all.filter((p) => p.status === "scheduled" && p.scheduled_at && isToday(p.scheduled_at));
  const failed = all.filter((p) => p.status === "failed");
  const needsAttention = all.filter((p) => p.status === "needs_repair" || p.warnings.includes("status_mismatch") || p.warnings.includes("stale_lock"));
  const drafts = all.filter((p) => p.status === "draft").slice(0, 8);
  const recentIngest = status.data?.recent_ingest.filter((e) => e.result !== "skipped").slice(0, 6) ?? [];

  return (
    <>
      <PageHeader
        title={channel ? `${CHANNEL_META[channel].name} 데스크` : "데스크"}
        description={posts.data ? `${all.length}개 포스트 · 인덱스 ${fmtTime(posts.data.generated_at)}` : "불러오는 중…"}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={channel ? `/library?ch=${channel}` : "/library"}>
              라이브러리 <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Stat label="초안" value={byStatus.draft ?? 0} hint={`수정 필요 ${byStatus.needs_repair ?? 0}`} icon={Inbox} />
          <Stat label="승인 · 예약" value={(byStatus.approved ?? 0) + (byStatus.scheduled ?? 0)} hint={`오늘 예약 ${dueToday.length}`} icon={CalendarClock} />
          <Stat label="최근 24시간 게시" value={last24h} hint={`일일 한도 ${DAILY_LIMIT} (계정당)`} icon={Send} progress={last24h / DAILY_LIMIT} />
          <Stat label="실패" value={failed.length} hint={failed.length ? "게시 큐에서 재시도" : "문제 없음"} icon={failed.length ? AlertTriangle : CheckCircle2} tone={failed.length ? "danger" : "ok"} />
        </div>

        {!channel && (
          <section className="mt-6">
            <SectionTitle>채널별 현황</SectionTitle>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {CHANNEL_KEYS.map((ch) => (
                <ChannelSummary key={ch} channel={ch} posts={all.filter((p) => p.channel === ch)} />
              ))}
            </div>
          </section>
        )}

        {(needsAttention.length > 0 || failed.length > 0) && (
          <section className="mt-6">
            <SectionTitle>확인 필요</SectionTitle>
            <div className="flex flex-col gap-2">
              {[...needsAttention, ...failed.filter((f) => !needsAttention.includes(f))].map((p) => (
                <AttentionRow key={p.post_id} post={p} />
              ))}
            </div>
          </section>
        )}

        <section className="mt-6">
          <div className="flex items-center justify-between">
            <SectionTitle>편집 대기 초안</SectionTitle>
            <Link href={`/library?status=draft${channel ? `&ch=${channel}` : ""}`} className="text-xs text-muted-foreground hover:text-foreground">
              전체 보기
            </Link>
          </div>
          {drafts.length === 0 ? (
            <Empty>초안이 없습니다. Inbox 를 동기화하면 ChatGPT 산출물이 여기 나타납니다.</Empty>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
              {drafts.map((p) => (
                <PostCard key={p.post_id} post={p} />
              ))}
            </div>
          )}
        </section>

        {recentIngest.length > 0 && (
          <section className="mt-6">
            <SectionTitle>최근 인제스트</SectionTitle>
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <tbody>
                  {recentIngest.map((e, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{fmtTime(e.at)}</td>
                      <td className="px-3 py-2 text-xs font-semibold">{e.channel}</td>
                      <td className="px-3 py-2 font-mono text-xs">{e.prefix}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className={cn("rounded px-1.5 py-0.5", e.result === "created" ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : e.result === "needs_repair" ? "bg-rose-500/12 text-rose-700 dark:text-rose-300" : "bg-muted text-muted-foreground")}>
                          {e.result}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[40ch]" title={e.message}>{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, hint, icon: Icon, progress, tone }: { label: string; value: number; hint?: string; icon: typeof Inbox; progress?: number; tone?: "ok" | "danger" }) {
  return (
    <Card className="shadow-none">
      <CardHeader className="flex flex-row items-center justify-between pb-1">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={cn("size-4", tone === "danger" ? "text-red-500" : tone === "ok" ? "text-emerald-500" : "text-muted-foreground")} />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
        {progress !== undefined && (
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-foreground" style={{ width: `${Math.min(100, progress * 100)}%` }} />
          </div>
        )}
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function ChannelSummary({ channel, posts }: { channel: ChannelKey; posts: IndexEntry[] }) {
  const c = countBy(posts, (p) => p.status);
  const order: PostStatus[] = ["needs_repair", "draft", "approved", "scheduled", "failed", "published"];
  return (
    <Link href={`/dashboard?ch=${channel}`} className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/40">
      <div className="flex items-center gap-2">
        <span className="size-2.5 rounded-full" style={{ background: CHANNEL_META[channel].color }} />
        <span className="text-sm font-semibold">{CHANNEL_META[channel].name}</span>
        <span className="ml-auto text-xs text-muted-foreground">{posts.length}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {order.filter((s) => c[s]).map((s) => (
          <span key={s} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {STATUS_LABEL[s]} <b className="text-foreground">{c[s]}</b>
          </span>
        ))}
        {posts.length === 0 && <span className="text-xs text-muted-foreground">포스트 없음</span>}
      </div>
    </Link>
  );
}

function AttentionRow({ post }: { post: IndexEntry }) {
  const reasons: string[] = [];
  if (post.status === "needs_repair") reasons.push("필수값 누락 — 편집기에서 수정 후 저장");
  if (post.warnings.includes("status_mismatch")) reasons.push(`폴더(${STATUS_LABEL[post.folder_status]}) ≠ 상태(${STATUS_LABEL[post.status]})`);
  if (post.warnings.includes("stale_lock")) reasons.push("게시 중 락이 10분 이상 유지됨");
  if (post.status === "failed") reasons.push(post.last_error ?? "게시 실패");
  const href = post.status === "needs_repair" ? `/editor/${encodeURIComponent(post.post_id)}` : `/publish/${encodeURIComponent(post.post_id)}`;
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-accent/40">
      <Wrench className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: CHANNEL_META[post.channel].color }}>{post.channel}</span>
          <span className="truncate text-sm font-medium">{post.headline.split("\n")[0] || post.post_id}</span>
          <StatusBadge status={post.status} />
        </div>
        <div className="truncate text-xs text-muted-foreground">{reasons.join(" · ")}</div>
      </div>
      <ArrowRight className="size-4 text-muted-foreground" />
    </Link>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</h2>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{children}</div>;
}

function countBy<T, K extends string>(arr: T[], key: (t: T) => K): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const a of arr) out[key(a)] = (out[key(a)] ?? 0) + 1;
  return out;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
