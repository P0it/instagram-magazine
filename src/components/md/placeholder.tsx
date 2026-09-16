"use client";

import { ImageIcon, User } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 이미지가 없을 때의 자리 — 연한 중립 배경 + 옅은 아이콘.
 * 채널 색 그라디언트처럼 진한 면을 만들지 않는다.
 */
export function ImagePlaceholder({ label, className, compact }: { label?: string; className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex size-full flex-col items-center justify-center gap-2 bg-fill-alt text-label-assistive", className)}>
      <ImageIcon className={compact ? "size-4 opacity-60" : "size-6 opacity-60"} />
      {label && !compact && <span className="line-clamp-2 max-w-[85%] text-center text-[11px] font-medium leading-snug text-label-alt">{label}</span>}
    </div>
  );
}

/** 계정 프로필 자리 — 연한 원 + 사람 아이콘, 채널 색은 얇은 링으로만 */
export function AvatarPlaceholder({ size = 40, ring, className }: { size?: number; ring?: string; className?: string }) {
  return (
    <div
      className={cn("grid shrink-0 place-items-center rounded-full bg-fill text-label-assistive", className)}
      style={{ width: size, height: size, boxShadow: ring ? `0 0 0 2px var(--semantic-background-normal-normal), 0 0 0 3.5px ${ring}` : "inset 0 0 0 1px var(--semantic-line-normal-neutral)" }}
    >
      <User style={{ width: size * 0.48, height: size * 0.48 }} className="opacity-70" />
    </div>
  );
}
