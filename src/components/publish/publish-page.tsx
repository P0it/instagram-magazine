"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ArrowLeft, ExternalLink, PencilLine, RotateCcw } from "lucide-react";
import { useAccounts, useApproval, usePost, useRepair, useRetry, useSystemStatus, useTransition } from "@/lib/client/queries";
import { driveFileUrl } from "@/lib/client/api";
import { CHANNEL_META } from "@/lib/client/channel";
import { STATUS_LABEL, USER_TRANSITIONS, folderForStatus, isStaleLock } from "@/lib/metadata/transitions";
import { PageHeader } from "@/components/shell/page-header";
import { StatusBadge } from "@/components/library/status-badge";
import { ApprovalChecklist } from "./approval-checklist";
import { PublishSheet } from "./publish-sheet";
import { GridPreview } from "@/components/preview/grid-preview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtTime } from "@/components/dashboard/dashboard";

export function PublishPage({ postId }: { postId: string }) {
  const post = usePost(postId);
  const approval = useApproval(postId);
  const accounts = useAccounts();
  const status = useSystemStatus();
  const transition = useTransition(postId);
  const repair = useRepair(postId);
  const retry = useRetry(postId);
  const [repairOpen, setRepairOpen] = useState(false);

  if (post.isError) return <div className="p-8 text-sm text-red-600">포스트를 불러올 수 없습니다.</div>;
  if (!post.data) return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">불러오는 중…</div>;

  const b = post.data;
  const m = b.metadata;
  const mismatch = folderForStatus(m.status) !== b.folderStatus;
  const stale = m.status === "publishing" && isStaleLock(m.publish?.locked_at);
  const channelAccountKey = status.data?.channels.find((c) => c.key === m.channel)?.instagram_account_key ?? null;
  const canPublish = (m.status === "approved" || m.status === "scheduled") && !mismatch;
  const userTransitions = USER_TRANSITIONS[m.status] ?? [];

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon-sm"><Link href="/library"><ArrowLeft className="size-4" /></Link></Button>
            <span className="text-xs font-bold" style={{ color: CHANNEL_META[m.channel].color }}>{m.channel}</span>
            <span className="truncate">{m.headline.split("\n")[0] || m.post_id}</span>
            <StatusBadge status={m.status} />
          </span>
        }
        description={<span className="font-mono">{m.post_id} · 폴더 /{b.folderStatus} · 갱신 {fmtTime(m.updated_at)}</span>}
        actions={
          <>
            <Button asChild variant="outline" size="sm"><Link href={`/editor/${encodeURIComponent(postId)}`}><PencilLine className="size-3.5" /> 편집</Link></Button>
            {(m.status === "failed" || stale) && (
              <Button variant="outline" size="sm" onClick={() => retry.mutate()} disabled={retry.isPending}>
                <RotateCcw className="size-3.5" /> {retry.isPending ? "재시도 중…" : "재게시"}
              </Button>
            )}
            <PublishSheet
              bundle={b}
              accounts={accounts.data?.accounts ?? []}
              defaultAccountKey={m.publish?.account_key ?? channelAccountKey}
              disabled={!canPublish}
              disabledReason={mismatch ? "status_mismatch 복구 후 게시할 수 있습니다" : m.status === "draft" ? "먼저 승인하세요" : undefined}
            />
          </>
        }
      />

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {(mismatch || stale) && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-600" />
            <div className="flex-1 text-sm">
              {mismatch && (
                <p>
                  <b>상태 불일치</b> — metadata.status 는 <b>{STATUS_LABEL[m.status]}</b> 인데 폴더는 <b>/{b.folderStatus}</b> 에 있습니다.
                </p>
              )}
              {stale && <p><b>오래된 락</b> — 게시 중 상태가 10분 이상 유지되었습니다. 재게시하거나 승인 상태로 복구하세요.</p>}
            </div>
            {mismatch && <Button size="sm" variant="outline" onClick={() => setRepairOpen(true)}>복구</Button>}
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-5">
            <Card className="shadow-none">
              <CardHeader><CardTitle className="text-sm">렌더 ({b.renders.length} / {m.slides.length})</CardTitle></CardHeader>
              <CardContent>
                {b.renders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">렌더가 없습니다. 편집기에서 &quot;저장 + 렌더&quot;를 실행하세요.</p>
                ) : (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {b.renders.map((r) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={r.fileId} src={driveFileUrl(r.fileId)} alt={r.name} className="h-48 shrink-0 rounded-md border border-border object-cover" style={{ aspectRatio: "4/5" }} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-none">
              <CardHeader><CardTitle className="text-sm">승인 체크리스트</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ApprovalChecklist result={approval.data} loading={approval.isLoading} />
                <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                  {userTransitions.map((t) => (
                    <Button
                      key={t.to}
                      variant={t.variant}
                      size="sm"
                      disabled={transition.isPending || (t.to === "approved" && m.status === "draft" && approval.data && !approval.data.ok)}
                      onClick={() => transition.mutate({ to: t.to })}
                    >
                      {t.label}
                    </Button>
                  ))}
                  {m.status === "published" && m.publish?.ig_media_id && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><ExternalLink className="size-3" /> media {m.publish.ig_media_id} · {m.publish.published_at ? fmtTime(m.publish.published_at) : ""}</span>
                  )}
                </div>
              </CardContent>
            </Card>

            {m.publish && (
              <Card className="shadow-none">
                <CardHeader><CardTitle className="text-sm">게시 기록</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  <Kv k="계정" v={m.publish.account_key} />
                  <Kv k="모드" v={m.publish.mode} />
                  <Kv k="시도" v={`${m.publish.attempt} / ${m.publish.max_attempts}`} />
                  <Kv k="예약" v={m.publish.run_at ? fmtTime(m.publish.run_at) : "—"} />
                  <Kv k="creation_id" v={m.publish.ig_creation_id ?? "—"} mono />
                  <Kv k="media_id" v={m.publish.ig_media_id ?? "—"} mono />
                  {m.publish.locked_at && <Kv k="locked_at" v={fmtTime(m.publish.locked_at)} />}
                  {m.publish.last_error && <div className="col-span-2 rounded-md bg-red-500/10 p-2 font-mono text-xs text-red-700 dark:text-red-300">{m.publish.last_error}</div>}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="flex flex-col gap-5">
            <Card className="shadow-none">
              <CardHeader><CardTitle className="text-sm">그리드 미리보기 · {m.channel}</CardTitle></CardHeader>
              <CardContent><GridPreview channel={m.channel} highlight={m.post_id} /></CardContent>
            </Card>
            <Card className="shadow-none">
              <CardHeader><CardTitle className="text-sm">출처</CardTitle></CardHeader>
              <CardContent className="text-sm">
                <div className="mb-2 text-xs text-muted-foreground">팩트체크: <b className="text-foreground">{b.sources.fact_check_status}</b>{m.fact_check_required && " (필수)"}</div>
                {b.sources.items.length === 0 ? <p className="text-xs text-muted-foreground">없음</p> : (
                  <ul className="flex flex-col gap-1 text-xs">
                    {b.sources.items.map((s, i) => (
                      <li key={i} className="truncate"><span className="text-muted-foreground">[{s.source_type}]</span> {s.title} {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="underline">↗</a>}</li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={repairOpen} onOpenChange={setRepairOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>상태 불일치 복구</DialogTitle>
            <DialogDescription>
              어느 쪽을 기준으로 맞출지 선택하세요. 폴더 기준은 metadata.status 를 <b>{STATUS_LABEL[b.folderStatus]}</b> 로 바꾸고, 메타 기준은 폴더를 <b>/{folderForStatus(m.status)}</b> 로 옮깁니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { repair.mutate("folder"); setRepairOpen(false); }}>폴더 기준</Button>
            <Button onClick={() => { repair.mutate("metadata"); setRepairOpen(false); }}>메타 기준</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Kv({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border/60 py-1">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span className={mono ? "font-mono text-xs" : ""}>{v}</span>
    </div>
  );
}
