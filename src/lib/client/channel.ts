"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CHANNEL_KEYS, ChannelKeySchema, type ChannelKey } from "@/types";

export interface ChannelMeta {
  name: string;
  short: string;
  /** "LIFE — 생활·주거" 형태의 보드 제목 */
  title: string;
  /** 기본 인스타 핸들 (계정 미연결 시 표시용) */
  handle: string;
  color: string;
}

export const CHANNEL_META: Record<ChannelKey, ChannelMeta> = {
  LIFE: { name: "라이프", short: "LIFE", title: "LIFE — 생활·주거", handle: "life.magazine", color: "#FF5E00" },
  MIND: { name: "마인드", short: "MIND", title: "MIND — 마음·관계", handle: "mind.magazine", color: "#6541F2" },
  AI: { name: "AI", short: "AI", title: "AI — 도구·업무", handle: "ai.magazine", color: "#00BDDE" },
  TREND: { name: "트렌드", short: "TREND", title: "TREND — 핫플·유행", handle: "trend.magazine", color: "#F553DA" },
};

export const DEFAULT_CHANNEL: ChannelKey = CHANNEL_KEYS[0];

/** URL ?ch= 로 유지되는 현재 채널. 목업대로 항상 하나가 선택돼 있다(기본 LIFE). */
export function useChannel(): [ChannelKey, (ch: ChannelKey) => void] {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const parsed = ChannelKeySchema.safeParse(sp.get("ch"));
  const current = parsed.success ? parsed.data : DEFAULT_CHANNEL;
  const set = useCallback(
    (ch: ChannelKey) => {
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
