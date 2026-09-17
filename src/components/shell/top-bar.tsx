"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { RefreshCw, Settings, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSync, useSystemStatus, usePosts } from "@/lib/client/queries";
import { accountMeta, useAccountList, useChannel } from "@/lib/client/channel";
import { GhostIcon } from "@/components/md/primitives";

function syncLabel(iso: string | null | undefined): string {
  if (!iso) return "동기화 기록 없음";
  const d = new Date(iso);
  const diffMin = Math.round((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 1) return "방금 동기화";
  if (diffMin < 60) return `${diffMin}분 전 동기화`;
  return `마지막 동기화 ${d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })}`;
}

/** 목업 S-01 상단 바: 로고 · 채널(=계정) 탭 · 동기화 · 설정 (56px). 계정 0개면 탭이 비어 있다. */
export function TopBar() {
  const pathname = usePathname();
  const [channel, setChannel] = useChannel();
  const { accounts } = useAccountList();
  const status = useSystemStatus();
  const sync = useSync();
  const posts = usePosts({});
  const autoSynced = useRef(false);

  // 앱을 열 때 마지막 동기화가 30분 이상 지났으면 자동 1회
  useEffect(() => {
    if (autoSynced.current || !status.data) return;
    if (status.data.should_auto_sync) {
      autoSynced.current = true;
      sync.mutate();
    }
  }, [status.data, sync]);

  const queued = (posts.data?.posts ?? []).filter((p) => p.status === "scheduled" || p.status === "failed" || p.status === "publishing").length;
  const expiring = status.data?.accounts.filter((a) => a.status !== "connected" && a.status !== "unlinked").length ?? 0;
  const inSettings = pathname.startsWith("/settings");
  const inQueue = pathname.startsWith("/queue");

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-6 bg-surface px-5" style={{ boxShadow: "inset 0 -1px 0 var(--semantic-line-solid-neutral)" }}>
      <div className="flex min-w-0 items-center gap-5">
        <Link href={channel ? `/home?ch=${channel}` : "/home"} className="flex items-center gap-2 pr-1">
          <span className="size-5 rounded-md" style={{ background: "linear-gradient(135deg, var(--semantic-primary-normal), var(--semantic-accent-background-violet))" }} />
          <span className="text-[15px] font-semibold tracking-[-0.01em]">Magazine Desk</span>
        </Link>
        <nav className="flex items-center gap-0.5">
          {accounts.map((a) => {
            const m = accountMeta(a);
            const on = a.key === channel && !inSettings && !inQueue;
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => setChannel(a.key)}
                title={`@${m.handle}`}
                className="flex items-center gap-[7px] rounded-lg px-3 py-[7px] text-sm transition-colors hover:bg-fill-alt"
              >
                <span className="size-[7px] rounded-full" style={{ background: m.color }} />
                <span className={cn("tracking-[0.01em]", on ? "font-bold text-label" : "font-medium text-label-alt")}>{m.name}</span>
              </button>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-2.5">
        <span className="text-[13px] text-label-alt">{sync.isPending ? "동기화 중…" : syncLabel(status.data?.last_sync_at)}</span>
        <GhostIcon title="Drive 새로고침" onClick={() => sync.mutate()} disabled={sync.isPending} className="rounded-full">
          <RefreshCw className={cn("size-[18px] opacity-70", sync.isPending && "animate-spin")} />
        </GhostIcon>
        <Link href={channel ? `/queue?ch=${channel}` : "/queue"} title="게시 큐" className={cn("relative grid size-8 place-items-center rounded-full hover:bg-fill", inQueue && "bg-fill")}>
          <ListOrdered className="size-[18px] opacity-70" />
          {queued > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">{queued}</span>}
        </Link>
        <Link href="/settings" title="설정" className={cn("relative grid size-8 place-items-center rounded-full hover:bg-fill", inSettings && "bg-fill")}>
          <Settings className="size-[18px] opacity-70" />
          {expiring > 0 && <span className="absolute right-0.5 top-0.5 size-2 rounded-full bg-cautionary" />}
        </Link>
      </div>
    </header>
  );
}
