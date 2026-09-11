import type { PostStatus } from "@/types";

/** §6 상태 머신. key: from, value: 허용되는 to 목록 */
export const TRANSITIONS: Record<PostStatus, readonly PostStatus[]> = {
  needs_repair: ["draft"],
  draft: ["approved"],
  approved: ["draft", "scheduled", "publishing"],
  scheduled: ["approved", "publishing"],
  publishing: ["published", "failed"],
  published: [],
  failed: ["approved"],
};

export function canTransition(from: PostStatus, to: PostStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export type FolderStatus = "draft" | "approved" | "published";

/** 상태 → 있어야 할 폴더 */
export function folderForStatus(status: PostStatus): FolderStatus {
  switch (status) {
    case "needs_repair":
    case "draft":
      return "draft";
    case "approved":
    case "scheduled":
    case "publishing":
    case "failed":
      return "approved";
    case "published":
      return "published";
  }
}

/** 폴더 → 메타를 폴더 기준으로 복구할 때 부여할 상태 */
export function statusForFolder(folder: FolderStatus): PostStatus {
  switch (folder) {
    case "draft":
      return "draft";
    case "approved":
      return "approved";
    case "published":
      return "published";
  }
}

export const STALE_LOCK_MS = 10 * 60 * 1000;

export function isStaleLock(lockedAt: string | undefined, now = Date.now()): boolean {
  if (!lockedAt) return false;
  const t = Date.parse(lockedAt);
  if (Number.isNaN(t)) return true;
  return now - t > STALE_LOCK_MS;
}

/** UI 라벨 */
export const STATUS_LABEL: Record<PostStatus, string> = {
  needs_repair: "수정 필요",
  draft: "초안",
  approved: "승인",
  scheduled: "예약",
  publishing: "게시 중",
  published: "게시됨",
  failed: "실패",
};

/** 사용자가 버튼으로 직접 유발할 수 있는 전이만 (publishing/published 는 게시 흐름이 만든다) */
export const USER_TRANSITIONS: Partial<Record<PostStatus, { to: PostStatus; label: string; variant: "default" | "outline" | "destructive" }[]>> = {
  needs_repair: [{ to: "draft", label: "수정 완료 → 초안", variant: "default" }],
  draft: [{ to: "approved", label: "승인", variant: "default" }],
  approved: [
    { to: "draft", label: "반려 → 초안", variant: "outline" },
  ],
  scheduled: [{ to: "approved", label: "예약 취소", variant: "outline" }],
  failed: [{ to: "approved", label: "재시도 준비", variant: "default" }],
};
