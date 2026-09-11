import type { PostStatus } from "@/types";
import { STATUS_LABEL } from "@/lib/metadata/transitions";
import { cn } from "@/lib/utils";

const STYLE: Record<PostStatus, string> = {
  needs_repair: "bg-rose-500/12 text-rose-700 dark:text-rose-300 ring-rose-500/30",
  draft: "bg-neutral-500/12 text-neutral-700 dark:text-neutral-300 ring-neutral-500/30",
  approved: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30",
  scheduled: "bg-sky-500/12 text-sky-700 dark:text-sky-300 ring-sky-500/30",
  publishing: "bg-violet-500/12 text-violet-700 dark:text-violet-300 ring-violet-500/30",
  published: "bg-foreground text-background ring-foreground/20",
  failed: "bg-red-500/12 text-red-700 dark:text-red-300 ring-red-500/30",
};

export function StatusBadge({ status, className }: { status: PostStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset", STYLE[status], className)}>
      {STATUS_LABEL[status]}
    </span>
  );
}
