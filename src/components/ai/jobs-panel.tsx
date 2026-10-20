"use client";

import Link from "next/link";
import { Check, Loader2, RotateCcw, X } from "lucide-react";
import type { AiJob } from "@/types";
import { useCancelAiJob, useRetryAiJob } from "@/lib/client/queries";
import { cn } from "@/lib/utils";
import { canRetry, errorHint, jobProgress } from "./job-progress";

function ProgressBar({ job }: { job: AiJob }) {
  const { index, total } = jobProgress(job);
  const failed = job.status === "failed" || job.status === "canceled";
  return (
    <div className="flex gap-1" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn("h-1 flex-1 rounded-full", i < index ? (failed ? "bg-label-assistive" : "bg-brand") : i === index && job.status === "running" ? "animate-pulse bg-brand/60" : "bg-fill")} />
      ))}
    </div>
  );
}

function JobRow({ job }: { job: AiJob }) {
  const cancel = useCancelAiJob();
  const retry = useRetryAiJob();
  const p = jobProgress(job);
  const active = job.status === "queued" || job.status === "running";
  const title = job.input.brief.trim().split("\n")[0]?.slice(0, 40) || "지침 없음";
  return (
    <li className="flex flex-col gap-1.5 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{title}</span>
        <span className={cn("shrink-0 text-xs", job.status === "failed" ? "text-negative" : "text-label-alt")}>
          {active && <Loader2 className="mr-1 inline size-3 animate-spin" />}
          {job.status === "done" && <Check className="mr-1 inline size-3 text-positive" />}
          {p.label}
        </span>
      </div>
      <span className="text-[11px] text-label-assistive">@{job.input.account_key} · {job.input.format}{job.input.slide_count ? ` · ${job.input.slide_count}장` : ""}</span>
      {active && <ProgressBar job={job} />}
      {job.status === "failed" && job.error && (
        <p className="m-0 text-xs leading-relaxed text-negative">
          {job.error.message}
          {errorHint(job.error) && <span className="block text-label-alt">{errorHint(job.error)}</span>}
        </p>
      )}
      <div className="flex items-center gap-2 pt-0.5">
        {job.status === "done" && job.post_id && (
          <Link href={`/editor/${encodeURIComponent(job.post_id)}`} className="text-xs font-semibold text-brand hover:underline">초안 열기</Link>
        )}
        {active && (
          <button type="button" disabled={cancel.isPending} onClick={() => cancel.mutate(job.id)} className="flex items-center gap-1 text-xs font-semibold text-label-alt hover:text-label"><X className="size-3" />취소</button>
        )}
        {canRetry(job) && (
          <button type="button" disabled={retry.isPending} onClick={() => retry.mutate(job.id)} className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline"><RotateCcw className="size-3" />다시 시도</button>
        )}
        {(job.status === "failed" || job.status === "canceled") && !canRetry(job) && (
          <span className="text-[11px] text-label-assistive">첨부 사진이 지워져서 다시 시도할 수 없어요. 새로 생성해 주세요.</span>
        )}
      </div>
    </li>
  );
}

/** 최근 생성 작업 목록 (최신순 10건) */
export function JobsPanel({ jobs }: { jobs: AiJob[] }) {
  return (
    <div role="dialog" aria-label="AI 생성 작업" className="absolute right-0 top-full z-50 mt-2 w-[340px] overflow-hidden rounded-2xl bg-surface shadow-e-md hairline-neutral">
      <div className="px-4 pb-1 pt-3 text-sm font-semibold">AI 생성 작업</div>
      {jobs.length === 0 ? (
        <p className="m-0 px-4 pb-4 pt-1 text-xs text-label-alt">아직 만든 작업이 없어요. 레퍼런스에서 “AI로 생성하기”를 눌러 보세요.</p>
      ) : (
        <ul className="m-0 flex max-h-[60dvh] list-none flex-col divide-y divide-line overflow-auto p-0">
          {jobs.slice(0, 10).map((j) => (
            <JobRow key={j.id} job={j} />
          ))}
        </ul>
      )}
    </div>
  );
}
