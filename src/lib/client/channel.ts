"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AccountKey, PublicAccount } from "@/types";
import { useSystemStatus } from "./queries";

/**
 * 계정 = 채널. 채널 목록·이름·색은 하드코딩이 아니라 system status 의 accounts 에서 온다.
 * 이 모듈은 클라이언트에서 "현재 채널" 을 고르는 헬퍼만 둔다.
 */

export interface ChannelMeta {
  key: AccountKey;
  /** 사용자가 지은 채널 이름 (기본 username) */
  name: string;
  /** 보드 제목: "@handle — 이름" 형태 */
  title: string;
  handle: string;
  color: string;
  /** 연결 시점 username 과 현재 IG username 이 다르면 true */
  handleChanged: boolean;
}

export function accountMeta(a: PublicAccount): ChannelMeta {
  const handleChanged = a.username !== a.key;
  return {
    key: a.key,
    name: a.name || a.key,
    title: a.name && a.name !== a.key ? `@${a.key} — ${a.name}` : `@${a.key}`,
    handle: a.username,
    color: a.color,
    handleChanged,
  };
}

/** 연결된 계정 목록 (system status 기준). 로딩 중이면 빈 배열. */
export function useAccountList(): { accounts: PublicAccount[]; isLoading: boolean } {
  const status = useSystemStatus();
  return { accounts: status.data?.accounts ?? [], isLoading: status.isLoading };
}

/** key 로 계정 찾기. 목록에 없으면 null. */
export function useAccount(key: AccountKey | null | undefined): PublicAccount | null {
  const { accounts } = useAccountList();
  if (!key) return null;
  return accounts.find((a) => a.key === key) ?? null;
}

/** 이름·색 없이 키만 있을 때(연결 해제된 계정의 포스트 등) 쓰는 대체 메타 */
export function fallbackMeta(key: string): ChannelMeta {
  return { key, name: key, title: `@${key}`, handle: key, color: "#8B8B8B", handleChanged: false };
}

export function useChannelMeta(key: string | null | undefined): ChannelMeta {
  const a = useAccount(key);
  return a ? accountMeta(a) : fallbackMeta(key ?? "");
}

/**
 * URL ?ch= 로 유지되는 현재 채널. 값은 계정 key(username).
 * 없거나 목록에 없는 값이면 첫 계정. 계정이 0개면 null.
 */
export function useChannel(): [AccountKey | null, (ch: AccountKey) => void] {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { accounts } = useAccountList();
  const wanted = sp.get("ch");
  const current = accounts.find((a) => a.key === wanted)?.key ?? accounts[0]?.key ?? null;
  const set = useCallback(
    (ch: AccountKey) => {
      const next = new URLSearchParams(sp.toString());
      next.set("ch", ch);
      router.replace(`${pathname}?${next.toString()}`);
    },
    [sp, router, pathname],
  );
  return [current, set];
}

/** 채널 색으로 만든 커버 대체 그라디언트 (썸네일 없는 카드용) */
export function channelGround(color: string, i = 0): string {
  const hi = 88 - (i % 4) * 9;
  const lo = 34 - (i % 3) * 6;
  return `linear-gradient(155deg, color-mix(in oklch, ${color} ${hi}%, #14151A), color-mix(in oklch, ${color} ${lo}%, #14151A))`;
}
