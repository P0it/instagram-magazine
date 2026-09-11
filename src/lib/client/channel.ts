"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChannelKeySchema, type ChannelKey } from "@/types";

export const CHANNEL_META: Record<ChannelKey, { name: string; short: string; color: string }> = {
  LIFE: { name: "라이프", short: "LIFE", color: "#2563eb" },
  MIND: { name: "마인드", short: "MIND", color: "#b45309" },
  AI: { name: "AI", short: "AI", color: "#0891b2" },
  POEM: { name: "포엠", short: "POEM", color: "#9d174d" },
};

/** URL ?ch= 로 유지되는 현재 채널 (null = 전체) */
export function useChannel(): [ChannelKey | null, (ch: ChannelKey | null) => void] {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const parsed = ChannelKeySchema.safeParse(sp.get("ch"));
  const current = parsed.success ? parsed.data : null;
  const set = useCallback(
    (ch: ChannelKey | null) => {
      const next = new URLSearchParams(sp.toString());
      if (ch) next.set("ch", ch);
      else next.delete("ch");
      const qs = next.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`);
    },
    [sp, router, pathname],
  );
  return [current, set];
}
