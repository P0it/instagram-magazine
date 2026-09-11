"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  LayoutDashboard,
  Library,
  ListOrdered,
  RefreshCw,
  Settings,
  AlertTriangle,
  Cloud,
  HardDrive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSync, useSystemStatus } from "@/lib/client/queries";
import { ChannelSwitcher } from "./channel-switcher";

const NAV = [
  { href: "/dashboard", label: "데스크", icon: LayoutDashboard },
  { href: "/library", label: "라이브러리", icon: Library },
  { href: "/queue", label: "게시 큐", icon: ListOrdered },
  { href: "/settings/accounts", label: "설정", icon: Settings, match: "/settings" },
];

function relTime(iso: string | null): string {
  if (!iso) return "동기화 기록 없음";
  const diff = Date.now() - Date.parse(iso);
  const m = Math.round(diff / 60_000);
  if (m < 1) return "방금 동기화";
  if (m < 60) return `${m}분 전 동기화`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}시간 전 동기화`;
  return `${Math.round(h / 24)}일 전 동기화`;
}

export function Sidebar() {
  const pathname = usePathname();
  const status = useSystemStatus();
  const sync = useSync();
  const autoSynced = useRef(false);

  // 앱을 열 때 마지막 동기화가 30분 이상 지났으면 자동 1회
  useEffect(() => {
    if (autoSynced.current || !status.data) return;
    if (status.data.should_auto_sync) {
      autoSynced.current = true;
      sync.mutate();
    }
  }, [status.data, sync]);

  const expiring = status.data?.accounts.filter((a) => a.status !== "connected") ?? [];

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-5 pt-5 pb-4">
        <div className="flex size-8 items-center justify-center rounded-lg bg-foreground text-background text-xs font-black tracking-tight">
          MD
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Magazine Desk</div>
          <div className="text-[11px] text-muted-foreground">에디토리얼 데스크</div>
        </div>
      </div>

      <div className="px-3">
        <ChannelSwitcher />
      </div>

      <nav className="mt-4 flex flex-col gap-0.5 px-3">
        {NAV.map((n) => {
          const active = pathname.startsWith(n.match ?? n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <n.icon className="size-4" />
              {n.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3 p-4 text-xs">
        {expiring.length > 0 && (
          <Link href="/settings/accounts" className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Instagram 토큰 확인 필요: {expiring.map((a) => `@${a.username}`).join(", ")}
            </span>
          </Link>
        )}
        <Button
          variant="outline"
          size="sm"
          className="justify-start gap-2"
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
        >
          <RefreshCw className={cn("size-3.5", sync.isPending && "animate-spin")} />
          {sync.isPending ? "동기화 중…" : "Inbox 동기화"}
        </Button>
        <div className="flex items-center justify-between text-muted-foreground">
          <span>{relTime(status.data?.last_sync_at ?? null)}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="gap-1 font-normal">
                {status.data?.drive_kind === "google" ? <Cloud className="size-3" /> : <HardDrive className="size-3" />}
                {status.data?.drive_kind === "google" ? "Drive" : "Mock"}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              {status.data?.drive_kind === "google" ? "Google Drive 서비스 계정 연결됨" : "인메모리 Mock Drive (DRIVE_CLIENT=mock)"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </aside>
  );
}
