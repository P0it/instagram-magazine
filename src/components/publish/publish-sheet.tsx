"use client";

import { useMemo, useState } from "react";
import { Check, CircleCheck, ExternalLink } from "lucide-react";
import { formatDims, type PostBundle, type PostStatus } from "@/types";
import type { EditorSnapshot } from "@/stores/editor-store";
import { api } from "@/lib/client/api";
import { useAccounts, useInvalidatePosts, useSystemStatus } from "@/lib/client/queries";
import { evaluateApprovalGate } from "@/lib/metadata/approval-gate";
import { CHANNEL_META } from "@/lib/client/channel";
import { fmtTime } from "@/lib/client/format";
import { Segmented } from "@/components/md/segmented";
import { fieldClass } from "@/components/md/primitives";
import { AvatarPlaceholder } from "@/components/md/placeholder";
import { cn } from "@/lib/utils";

type Stage = "idle" | "uploading" | "approving" | "posting" | "done" | "scheduled" | "error";

/**
 * 목업 S-04 게시 바텀시트.
 * 게시는 여기서 사용자가 CTA 를 눌러야만 시작된다: 저장+렌더 → 승인 전이 → /publish.
 * 예약은 단계가 아니라 "지금/나중에" 옵션.
 */
interface SheetProps {
  onClose: () => void;
  snapshot: EditorSnapshot;
  /** 저장 + 렌더 + 업로드. 최신 번들 반환 */
  prepare: () => Promise<PostBundle | null>;
  onDone: (next: "home" | "stay") => void;
}

export function PublishSheet({ open, ...rest }: SheetProps & { open: boolean }) {
  // 열릴 때마다 마운트 → 단계/오류 상태가 초기화된다
  return open ? <SheetBody {...rest} /> : null;
}

function SheetBody({ onClose, snapshot, prepare, onDone }: SheetProps) {
  const accounts = useAccounts();
  const invalidate = useInvalidatePosts();
  const m = snapshot.metadata;
  const meta = CHANNEL_META[m.channel];
  const channelAccountKey = status.data?.channels.find((c) => c.key === m.channel)?.instagram_account_key ?? null;
  const list = useMemo(() => accounts.data?.accounts ?? [], [accounts.data]);
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const accountKey = pickedKey ?? m.publish?.account_key ?? channelAccountKey ?? list[0]?.key ?? "";
  const setAccountKey = setPickedKey;
  const [timing, setTiming] = useState<"now" | "later">("now");
  const [runAt, setRunAt] = useState(defaultRunAt());
  const [stage, setStage] = useState<Stage>(() => (m.status === "published" ? "done" : "idle"));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: PostStatus; media?: string } | null>(() => (m.status === "published" ? { status: "published", media: m.publish?.ig_media_id } : null));

  // 렌더 전 클라이언트 사전 점검 (렌더 관련 항목은 게시 시점에 서버가 다시 본다)
  const issues = useMemo(() => {
    const dims = m.slides.map(() => ({ ...formatDims(m.format), format: "jpeg" as const }));
    return evaluateApprovalGate({ metadata: m, sources: snapshot.sources, renderDims: dims }).checks.filter((c) => !c.ok && !c.id.startsWith("render_"));
  }, [m, snapshot.sources]);

  const account = list.find((a) => a.key === accountKey);
  const accountOk = !!account && account.status !== "expired" && account.status !== "error";
  const busy = stage === "uploading" || stage === "approving" || stage === "posting";
  const ctaDisabled = issues.length > 0 || !accountOk || busy || m.status === "publishing";
  const ctaLabel = stage === "uploading" ? "이미지 올리는 중" : stage === "approving" ? "승인 확인 중" : stage === "posting" ? (timing === "later" ? "예약 등록 중" : "게시 중") : timing === "later" ? "예약 등록하기" : "인스타그램에 게시하기";

  async function publish() {
    if (ctaDisabled) return;
    setErrorMsg(null);
    try {
      setStage("uploading");
      const prepared = await prepare();
      if (!prepared) throw new Error("저장에 실패해 게시를 중단했어요.");

      // 상태 머신: needs_repair → draft → approved, failed → approved. approved/scheduled 는 그대로.
      setStage("approving");
      let st: PostStatus = prepared.metadata.status;
      if (st === "needs_repair") st = (await api.transition(m.post_id, "draft")).metadata.status;
      if (st === "draft" || st === "failed") st = (await api.transition(m.post_id, "approved")).metadata.status;
      if (st !== "approved" && st !== "scheduled") throw new Error(`게시할 수 없는 상태예요 (${st})`);

      setStage("posting");
      const r = await api.publish(m.post_id, {
        account_key: accountKey,
        mode: timing === "later" ? "scheduled" : "immediate",
        run_at: timing === "later" ? new Date(runAt).toISOString() : undefined,
      });
      invalidate(m.post_id);
      if (!r.ok) throw new Error(r.error ?? "게시 실패");
      setResult({ status: r.status, media: r.ig_media_id });
      setStage(r.status === "scheduled" ? "scheduled" : "done");
    } catch (e) {
      invalidate(m.post_id);
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStage("error");
    }
  }

  return (
    <div role="dialog" aria-modal="true" onClick={busy ? undefined : onClose} className="fixed inset-0 z-40 flex items-end justify-center" style={{ background: "var(--semantic-material-dimmer)" }}>
      <div onClick={(e) => e.stopPropagation()} className="md-sheet-up w-[440px] max-w-full rounded-t-[20px] bg-elevated px-5 pb-6 pt-2.5 shadow-e-xl">
        <div className="flex justify-center pb-3.5 pt-1">
          <div className="h-1 w-11 rounded-full bg-fill-strong" />
        </div>

        {stage === "done" || stage === "scheduled" ? (
          <div className="flex flex-col items-center gap-3.5 px-0 pb-1.5 pt-[18px]">
            <CircleCheck className="size-11 text-positive" />
            <span className="text-xl font-bold tracking-[-0.012em]">{stage === "scheduled" ? "예약했어요" : "게시했어요"}</span>
            <span className="text-sm text-label-alt">
              @{account?.username ?? meta.handle} · {m.content_type === "carousel" ? `캐러셀 ${m.slides.length}장` : "단일 이미지"}
              {stage === "scheduled" ? ` · ${fmtTime(new Date(runAt).toISOString())}` : result?.media ? ` · media ${result.media}` : ""}
            </span>
            <div className="flex w-full gap-2.5 pt-2">
              {stage === "done" ? (
                <a href={`https://www.instagram.com/${account?.username ?? ""}`} target="_blank" rel="noreferrer" className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl text-[15px] font-semibold text-label-neutral hairline hover:bg-fill-alt">
                  <ExternalLink className="size-4" />인스타에서 보기
                </a>
              ) : (
                <button type="button" onClick={() => onDone("stay")} className="h-12 flex-1 rounded-xl text-[15px] font-semibold text-label-neutral hairline hover:bg-fill-alt">계속 편집</button>
              )}
              <button type="button" onClick={() => onDone("home")} className="h-12 flex-1 rounded-xl bg-brand text-[15px] font-semibold text-white hover:bg-brand-strong">홈으로</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-[18px]">
            <h2 className="m-0 text-xl font-bold leading-7 tracking-[-0.012em]">인스타그램에 게시할까요?</h2>

            {list.length === 0 ? (
              <div className="rounded-xl px-3.5 py-3 text-[13px]" style={{ background: "var(--semantic-background-status-cautionary)", color: "var(--semantic-status-cautionary)" }}>
                연결된 인스타그램 계정이 없어요. 설정에서 계정을 연결하세요.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {list.map((a) => {
                  const on = a.key === accountKey;
                  const bad = a.status === "expired" || a.status === "error";
                  return (
                    <button key={a.key} type="button" onClick={() => setAccountKey(a.key)} className={cn("flex items-center gap-3 rounded-xl px-3.5 py-3 text-left", on ? "bg-fill" : "bg-fill-alt hover:bg-fill")}>
                      <div className="size-10 shrink-0 rounded-full" style={{ background: a.key === channelAccountKey ? meta.color : "var(--semantic-interaction-inactive)" }} />
                      <div className="flex flex-1 flex-col gap-0.5">
                        <span className="text-[15px] font-semibold">@{a.username}</span>
                        <span className={cn("text-[13px]", bad ? "text-negative" : "text-label-alt")}>
                          {a.key === channelAccountKey ? `${m.channel} 채널 기본 계정` : a.key}
                          {bad ? " · 토큰 만료 — 재연결 필요" : a.status === "expiring" ? " · 만료 임박" : ""}
                        </span>
                      </div>
                      {on && <Check className="size-5 text-brand" />}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Segmented value={timing} onChange={setTiming} items={[{ value: "now", label: "지금 게시" }, { value: "later", label: "나중에 (예약)" }]} />
              {timing === "later" && (
                <>
                  <input type="datetime-local" value={runAt} onChange={(e) => setRunAt(e.target.value)} className={fieldClass} />
                  <span className="text-[11px] leading-normal text-label-assistive">외부 핑거가 5분 간격으로 /api/cron/publish 를 호출해야 정시에 게시돼요.</span>
                </>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <span className={cn("text-sm", issues.length ? "font-semibold text-negative" : "text-label-neutral")}>
                {issues.length ? `게시 전에 확인할 것 ${issues.length}건` : `${m.content_type === "carousel" ? `캐러셀 ${m.slides.length}장` : "단일 이미지"} · ${m.format} · 캡션 ${m.caption.length.toLocaleString()}자 · 해시태그 ${m.hashtags.length}개`}
              </span>
              {issues.map((c) => (
                <span key={c.id} className="text-[13px] text-label-alt">· {c.label}{c.detail ? ` — ${c.detail}` : ""}</span>
              ))}
              {!issues.length && <span className="text-[13px] text-label-alt">게시를 누르면 저장하고 슬라이드를 렌더한 뒤 올려요.</span>}
              {errorMsg && <span className="text-[13px] font-medium text-negative">{errorMsg}</span>}
              {m.status === "publishing" && <span className="text-[13px] text-label-alt">이미 게시가 진행 중이에요.</span>}
            </div>

            <button type="button" onClick={publish} disabled={ctaDisabled} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-[15px] font-semibold text-white transition-colors hover:bg-brand-strong disabled:bg-[var(--semantic-interaction-disable)] disabled:text-label-assistive">
              {busy && <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
              {ctaLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function defaultRunAt(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
