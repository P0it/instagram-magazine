"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ChevronLeft, ExternalLink, PencilLine, RotateCcw } from "lucide-react";
import { useApproval, usePost, useRepair, useRetry, useTransition } from "@/lib/client/queries";
import { driveFileUrl } from "@/lib/client/api";
import { CHANNEL_META } from "@/lib/client/channel";
import { fmtTime } from "@/lib/client/format";
import { STATUS_LABEL, USER_TRANSITIONS, folderForStatus, isStaleLock } from "@/lib/metadata/transitions";
import { isTouched } from "@/lib/metadata/stage";
import { StageBadge } from "@/components/md/primitives";
import { ApprovalChecklist } from "./approval-checklist";
import { GridPreview } from "@/components/preview/grid-preview";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** 게시 기록 · 상태 복구 화면. 게시 자체는 빌더의 바텀시트에서 시작한다. */
export function PublishPage({ postId }: { postId: string }) {
  const post = usePost(postId);
  const approval = useApproval(postId);
  const transition = useTransition(postId);
  const repair = useRepair(postId);
  const retry = useRetry(postId);
  const [repairOpen, setRepairOpen] = useState(false);

  if (post.isError) return <div className="p-8 text-sm text-negative">포스트를 불러올 수 없습니다.</div>;
  if (!post.data) return <div className="flex flex-1 items-center justify-center text-sm text-label-alt">불러오는 중…</div>;

  const b = post.data;
  const m = b.metadata;
  const mismatch = folderForStatus(m.status) !== b.folderStatus;
  const stale = m.status === "publishing" && isStaleLock(m.publish?.locked_at);
  const userTransitions = USER_TRANSITIONS[m.status] ?? [];

  return (
    <div className="mx-auto box-border w-full max-w-[1100px] flex-1 overflow-auto px-5 pb-20 pt-8">
      <div className="mb-7 flex flex-wrap items-center gap-2.5">
        <Link href={`/home?ch=${m.channel}`} className="grid size-8 place-items-center rounded-full hover:bg-fill"><ChevronLeft className="size-5 opacity-70" /></Link>
        <span className="size-2 rounded-full" style={{ background: CHANNEL_META[m.channel].color }} />
        <h1 className="m-0 truncate text-2xl font-bold leading-8 tracking-[-0.023em]">{m.headline.split("\n")[0] || m.post_id}</h1>
        <StageBadge status={m.status} touched={isTouched({ render_count: b.renders.length, created_at: m.created_at, updated_at: m.updated_at })} />
        <span className="font-mono text-xs text-label-assistive">{m.post_id} · /{b.folderStatus} · {fmtTime(m.updated_at)}</span>
        <div className="ml-auto flex items-center gap-2">
          {(m.status === "failed" || stale) && (
            <button type="button" onClick={() => retry.mutate()} disabled={retry.isPending} className="flex h-9 items-center gap-1.5 rounded-[10px] px-3.5 text-sm font-semibold text-label-neutral hairline hover:bg-fill-alt disabled:opacity-50">
              <RotateCcw className="size-3.5" /> {retry.isPending ? "재시도 중…" : "재게시"}
            </button>
          )}
          <Link href={`/editor/${encodeURIComponent(postId)}`} className="flex h-9 items-center gap-1.5 rounded-[10px] bg-brand px-3.5 text-sm font-semibold text-white hover:bg-brand-strong">
            <PencilLine className="size-3.5" /> {m.status === "published" ? "빌더에서 보기" : "빌더에서 게시"}
          </Link>
        </div>
      </div>

      {(mismatch || stale) && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl p-4" style={{ background: "var(--semantic-background-status-negative)" }}>
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-negative" />
          <div className="flex-1 text-sm">
            {mismatch && <p className="m-0"><b>상태 불일치</b> — metadata.status 는 <b>{STATUS_LABEL[m.status]}</b> 인데 폴더는 <b>/{b.folderStatus}</b> 에 있어요.</p>}
            {stale && <p className="m-0"><b>오래된 락</b> — 게시 중 상태가 10분 이상 유지됐어요. 재게시하거나 승인 상태로 복구하세요.</p>}
          </div>
          {mismatch && <button type="button" onClick={() => setRepairOpen(true)} className="h-8 rounded-lg px-3 text-[13px] font-semibold hairline hover:bg-surface">복구</button>}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-5">
          <Section title={`렌더 ${b.renders.length} / ${m.slides.length}`}>
            {b.renders.length === 0 ? (
              <p className="m-0 text-sm text-label-alt">렌더가 없어요. 빌더에서 게시를 누르면 자동으로 만들어요.</p>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {b.renders.map((r) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={r.fileId} src={driveFileUrl(r.fileId)} alt={r.name} className="h-48 shrink-0 rounded-lg object-cover hairline-neutral" style={{ aspectRatio: "4/5" }} />
                ))}
              </div>
            )}
          </Section>

          <Section title="승인 체크리스트">
            <ApprovalChecklist result={approval.data} loading={approval.isLoading} />
            {userTransitions.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-4" style={{ boxShadow: "inset 0 1px 0 var(--semantic-line-solid-alternative)" }}>
                {userTransitions.map((t) => (
                  <button
                    key={t.to}
                    type="button"
                    disabled={transition.isPending || (t.to === "approved" && m.status === "draft" && approval.data && !approval.data.ok)}
                    onClick={() => transition.mutate({ to: t.to })}
                    className={t.variant === "default" ? "h-9 rounded-[10px] bg-brand px-3.5 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50" : "h-9 rounded-[10px] px-3.5 text-sm font-semibold text-label-neutral hairline hover:bg-fill-alt disabled:opacity-50"}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            {m.status === "published" && m.publish?.ig_media_id && (
              <span className="flex items-center gap-1 text-xs text-label-alt"><ExternalLink className="size-3" /> media {m.publish.ig_media_id} · {m.publish.published_at ? fmtTime(m.publish.published_at) : ""}</span>
            )}
          </Section>

          {m.publish && (
            <Section title="게시 기록">
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                <Kv k="계정" v={m.publish.account_key} />
                <Kv k="모드" v={m.publish.mode} />
                <Kv k="시도" v={`${m.publish.attempt} / ${m.publish.max_attempts}`} />
                <Kv k="예약" v={m.publish.run_at ? fmtTime(m.publish.run_at) : "—"} />
                <Kv k="creation_id" v={m.publish.ig_creation_id ?? "—"} mono />
                <Kv k="media_id" v={m.publish.ig_media_id ?? "—"} mono />
                {m.publish.locked_at && <Kv k="locked_at" v={fmtTime(m.publish.locked_at)} />}
                {m.publish.last_error && <div className="col-span-2 rounded-lg p-2 font-mono text-xs text-negative" style={{ background: "var(--semantic-background-status-negative)" }}>{m.publish.last_error}</div>}
              </div>
            </Section>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <Section title={`그리드 미리보기 · ${m.channel}`}><GridPreview channel={m.channel} highlight={m.post_id} /></Section>
          <Section title="출처">
            <div className="mb-2 text-xs text-label-alt">팩트체크: <b className="text-label">{b.sources.fact_check_status}</b>{m.fact_check_required && " (필수)"}</div>
            {b.sources.items.length === 0 ? <p className="m-0 text-xs text-label-alt">없음</p> : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs">
                {b.sources.items.map((s, i) => (
                  <li key={i} className="truncate"><span className="text-label-alt">[{s.source_type}]</span> {s.title} {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="text-brand">↗</a>}</li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      <Dialog open={repairOpen} onOpenChange={setRepairOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>상태 불일치 복구</DialogTitle>
            <DialogDescription>
              어느 쪽을 기준으로 맞출지 선택하세요. 폴더 기준은 metadata.status 를 <b>{STATUS_LABEL[b.folderStatus === "draft" ? "draft" : b.folderStatus === "approved" ? "approved" : "published"]}</b> 로 바꾸고, 메타 기준은 폴더를 <b>/{folderForStatus(m.status)}</b> 로 옮깁니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button" className="h-9 rounded-[10px] px-3.5 text-sm font-semibold hairline hover:bg-fill-alt" onClick={() => { repair.mutate("folder"); setRepairOpen(false); }}>폴더 기준</button>
            <button type="button" className="h-9 rounded-[10px] bg-brand px-3.5 text-sm font-semibold text-white" onClick={() => { repair.mutate("metadata"); setRepairOpen(false); }}>메타 기준</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl bg-surface">
      <div className="px-5 pb-2.5 pt-[18px]"><h2 className="m-0 text-[17px] font-semibold">{title}</h2></div>
      <div className="flex flex-col gap-4 px-5 pb-5">{children}</div>
    </section>
  );
}

function Kv({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1" style={{ boxShadow: "inset 0 -1px 0 var(--semantic-line-solid-alternative)" }}>
      <span className="text-xs text-label-alt">{k}</span>
      <span className={mono ? "font-mono text-xs" : ""}>{v}</span>
    </div>
  );
}
