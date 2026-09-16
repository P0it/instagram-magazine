import type { IndexEntry, PostMetadata, PostStatus } from "@/types";

/**
 * 화면에 노출하는 3단계 파이프라인. 내부 상태 머신(7개)은 그대로 두고
 * 여기서만 매핑한다. 대시보드·카드·배지가 공유.
 *
 * - inbox     : ChatGPT 초안이 도착했지만 사용자가 아직 저장(렌더)한 적 없음
 * - editing   : 사용자가 손댄 초안 · 승인 · 예약 · 게시 중 · 실패
 * - published : 게시 완료
 */
export const STAGES = ["inbox", "editing", "published"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  inbox: "초안",
  editing: "편집 중",
  published: "게시됨",
};

/**
 * @param touched 사용자가 저장한 흔적 — 렌더가 있거나 updated_at 이 created_at 과 다르면 true
 */
export function stageOfStatus(status: PostStatus, touched: boolean): Stage {
  if (status === "published") return "published";
  if ((status === "draft" || status === "needs_repair") && !touched) return "inbox";
  return "editing";
}

export function isTouched(x: { render_count?: number; renders?: unknown[]; created_at: string; updated_at: string }): boolean {
  const renders = x.render_count ?? x.renders?.length ?? 0;
  return renders > 0 || x.updated_at !== x.created_at;
}

export function stageOfEntry(e: Pick<IndexEntry, "status" | "render_count" | "created_at" | "updated_at">): Stage {
  return stageOfStatus(e.status, isTouched(e));
}

export function stageOfPost(m: Pick<PostMetadata, "status" | "created_at" | "updated_at">, renderCount: number): Stage {
  return stageOfStatus(m.status, isTouched({ render_count: renderCount, created_at: m.created_at, updated_at: m.updated_at }));
}

/** 카드에 빨간 점 + "확인 필요" 를 붙여야 하는 항목 */
export function needsAttention(e: Pick<IndexEntry, "status" | "warnings">): boolean {
  return e.status === "needs_repair" || e.status === "failed" || e.warnings.includes("status_mismatch") || e.warnings.includes("stale_lock");
}

/** 빌더 상단 배지 라벨. publishing 은 스피너 대신 텍스트로 구분. */
export function stageBadge(status: PostStatus, touched: boolean): { label: string; tone: "neutral" | "blue" | "green" | "red" | "cautionary" } {
  if (status === "publishing") return { label: "게시 중", tone: "blue" };
  if (status === "scheduled") return { label: "예약됨", tone: "cautionary" };
  if (status === "failed" || status === "needs_repair") return { label: "확인 필요", tone: "red" };
  const s = stageOfStatus(status, touched);
  return { label: STAGE_LABEL[s], tone: s === "inbox" ? "neutral" : s === "editing" ? "blue" : "green" };
}
