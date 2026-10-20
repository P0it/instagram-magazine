"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Check, Clock3, Lightbulb, LayoutTemplate, PlusSquare, RefreshCw, Settings, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSync, useSystemStatus, usePosts } from "@/lib/client/queries";
import { accountMeta, useAccountList, useChannel } from "@/lib/client/channel";
import { nextChannel } from "@/lib/client/channel-pick";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { NAV_ITEMS, activeNavKey, type NavKey } from "./nav-items";

const ICONS: Record<NavKey, LucideIcon> = {
  references: Lightbulb,
  templates: LayoutTemplate,
  create: PlusSquare,
  queue: Clock3,
  settings: Settings,
};

const IG_RING = "linear-gradient(45deg,#feda75,#fa7e1e,#d62976,#962fbf,#4f5bd5)";

function syncLabel(iso: string | null | undefined): string {
  if (!iso) return "동기화 기록 없음";
  const d = new Date(iso);
  const diffMin = Math.round((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 1) return "방금 동기화";
  if (diffMin < 60) return `${diffMin}분 전 동기화`;
  return `마지막 동기화 ${d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })}`;
}

/** 왼쪽 사이드바: 레퍼런스 · 템플릿 · 콘텐츠 만들기 · 게시 큐 · 설정 + 동기화 + 계정 전환. 1024px 미만은 아이콘 레일. */
export function Sidebar() {
  const pathname = usePathname();
  const active = activeNavKey(pathname);
  const [channel, setChannel] = useChannel();
  const { accounts, isLoading: accountsLoading } = useAccountList();
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

  // Alt+↑/↓ 로 계정을 바로 넘긴다 (입력 중에는 무시)
  useEffect(() => {
    const keys = accounts.map((a) => a.key);
    if (keys.length < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      const el = document.activeElement;
      if (el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const to = nextChannel(keys, channel, e.key === "ArrowDown" ? 1 : -1);
      if (to && to !== channel) { e.preventDefault(); setChannel(to); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [accounts, channel, setChannel]);

  const queued = (posts.data?.posts ?? []).filter((p) => p.status === "scheduled" || p.status === "failed" || p.status === "publishing").length;
  const expiring = status.data?.accounts.filter((a) => a.status !== "connected" && a.status !== "unlinked").length ?? 0;
  const current = accounts.find((a) => a.key === channel) ?? null;
  const meta = current ? accountMeta(current) : null;

  // 선택한 계정은 모든 메뉴에서 유지한다 (사이드바 하단에 항상 보이므로)
  const hrefFor = (href: string) => (channel ? `${href}?ch=${channel}` : href);

  return (
    <aside className="flex w-[72px] shrink-0 flex-col border-r border-line bg-surface-alt px-3 py-5 lg:w-[244px]" aria-label="주 메뉴">
      <Link href={hrefFor("/home")} className="mb-6 flex items-center gap-2.5 px-3 py-2">
        <span className="size-7 shrink-0 rounded-lg" style={{ background: IG_RING }} />
        <span className="hidden text-xl font-extrabold tracking-[-0.02em] lg:inline">Magazine Desk</span>
      </Link>

      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = ICONS[item.key];
          const on = active === item.key;
          return (
            <Link
              key={item.key}
              href={hrefFor(item.href)}
              title={item.label}
              aria-current={on ? "page" : undefined}
              className={cn("relative flex items-center gap-4 rounded-[10px] px-3 py-3 text-[15px] hover:bg-elevated", on ? "font-bold text-label" : "text-label")}
            >
              <Icon className="size-6 shrink-0" strokeWidth={on ? 2.4 : 1.8} />
              <span className="hidden lg:inline">{item.label}</span>
              {item.key === "queue" && queued > 0 && (
                <span className="absolute left-7 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white lg:static lg:ml-auto lg:h-5 lg:min-w-5 lg:text-[11px]">{queued}</span>
              )}
              {item.key === "settings" && expiring > 0 && <span className="absolute right-3 top-3 size-2 rounded-full bg-cautionary" />}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <button
        type="button"
        onClick={() => sync.mutate()}
        disabled={sync.isPending}
        title="Drive 새로고침"
        className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-label-alt hover:bg-elevated disabled:opacity-60"
      >
        <RefreshCw className={cn("size-4 shrink-0", sync.isPending && "animate-spin")} />
        <span className="hidden lg:inline">{sync.isPending ? "동기화 중…" : syncLabel(status.data?.last_sync_at)}</span>
      </button>

      {meta ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center gap-2.5 rounded-[10px] border border-line px-3 py-2.5 text-left hover:bg-elevated" title={`@${meta.handle}`}>
              <span className="size-9 shrink-0 rounded-full p-0.5" style={{ background: IG_RING }}>
                <span className="block size-full rounded-full border-2 border-black bg-fill-strong" />
              </span>
              <span className="hidden min-w-0 flex-1 lg:block">
                <span className="block truncate text-sm font-semibold">@{meta.handle}</span>
                <span className="block text-xs text-label-alt">
                  <span className={cn("mr-1 inline-block size-[7px] rounded-full", current?.status === "connected" ? "bg-positive" : "bg-cautionary")} />
                  {current?.status === "connected" ? "Instagram 연결됨" : "확인 필요"}
                </span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-60">
            {accounts.map((a) => {
              const m = accountMeta(a);
              const ok = a.status === "connected";
              return (
                <DropdownMenuItem key={a.key} onSelect={() => setChannel(a.key)} className="gap-2.5 py-2">
                  <span className="size-7 shrink-0 rounded-full p-[1.5px]" style={{ background: a.key === channel ? IG_RING : "var(--semantic-line-solid-normal)" }}>
                    <span className="block size-full rounded-full border-2 border-black bg-fill-strong" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm", a.key === channel && "font-semibold")}>@{m.handle}</span>
                    <span className="block truncate text-[11px] text-label-alt">
                      <span className={cn("mr-1 inline-block size-[6px] rounded-full", ok ? "bg-positive" : "bg-cautionary")} />
                      {a.status === "unlinked" ? "연결 안 됨" : ok ? "연결됨" : "확인 필요"}
                    </span>
                  </span>
                  {a.key === channel && <Check className="size-4 shrink-0" />}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings/accounts">계정 추가 · 관리</Link>
            </DropdownMenuItem>
            {accounts.length > 1 && <p className="px-2 py-1.5 text-[11px] text-label-alt">Alt + ↑ ↓ 로 바로 전환</p>}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : accountsLoading ? (
        <div className="h-[58px]" aria-hidden />
      ) : (
        <Link href="/settings/accounts" className="flex items-center justify-center rounded-[10px] bg-brand px-3 py-2.5 text-sm font-semibold text-white hover:opacity-90" title="계정 연결">
          <span className="lg:hidden">+</span>
          <span className="hidden lg:inline">Instagram 계정 연결</span>
        </Link>
      )}
    </aside>
  );
}
