"use client";

import { CheckCircle2, Circle, XCircle } from "lucide-react";
import type { ApprovalGateResult } from "@/types";
import { cn } from "@/lib/utils";

export function ApprovalChecklist({ result, loading }: { result?: ApprovalGateResult; loading?: boolean }) {
  if (loading || !result) {
    return (
      <ul className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground"><Circle className="size-4 animate-pulse" /> 확인 중…</li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {result.checks.map((c) => (
        <li key={c.id} className="flex items-start gap-2 text-sm">
          {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-red-500" />}
          <div className="min-w-0">
            <div className={cn(!c.ok && "font-medium")}>{c.label}</div>
            {c.detail && <div className="text-xs text-muted-foreground">{c.detail}</div>}
          </div>
        </li>
      ))}
    </ul>
  );
}
