"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { AiJob } from "@/types";
import { useAiJobs } from "@/lib/client/queries";
import { cn } from "@/lib/utils";
import { activeJobCount, jobProgress } from "./job-progress";
import { JobsPanel } from "./jobs-panel";

/**
 * 상단 바의 AI 작업 표시기. 작업이 하나라도 있으면 보이고, 진행 중이면 단계를 보여 준다.
 * 작업이 끝나면 포스트 목록을 새로 읽어 콘텐츠 만들기에 초안이 나타나게 한다.
 */
export function JobsIndicator() {
  const { data } = useAiJobs();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const seen = useRef<Map<string, AiJob["status"]> | null>(null);
  const jobs = data?.jobs ?? [];

  useEffect(() => {
    if (!data) return;
    const prev = seen.current;
    if (prev) {
      for (const j of data.jobs) {
        const before = prev.get(j.id);
        if (!before || before === j.status) continue;
        if (j.status === "done") {
          void qc.invalidateQueries({ queryKey: ["posts"] });
          toast.success("AI 초안이 만들어졌어요");
        } else if (j.status === "failed" && j.error) toast.error(`AI 생성 실패: ${j.error.message}`);
      }
    }
    seen.current = new Map(data.jobs.map((j) => [j.id, j.status]));
  }, [data, qc]);

  if (jobs.length === 0) return null;
  const active = activeJobCount(jobs);
  const current = jobs.find((j) => j.status === "running") ?? jobs.find((j) => j.status === "queued");

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="AI 생성 작업"
        title="AI 생성 작업"
        className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold hover:bg-fill", open ? "bg-fill text-label" : "text-label-alt")}
      >
        <Sparkles className={cn("size-[16px]", active > 0 ? "animate-pulse text-brand" : "opacity-70")} />
        {active > 0 && current ? `${jobProgress(current).label}${active > 1 ? ` 외 ${active - 1}` : ""}` : "AI"}
      </button>
      {open && <JobsPanel jobs={jobs} />}
    </div>
  );
}
