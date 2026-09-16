import { describe, expect, it } from "vitest";
import { isTouched, needsAttention, stageBadge, stageOfEntry, stageOfStatus } from "@/lib/metadata/stage";

const t0 = "2026-09-11T06:00:00.000Z";
const t1 = "2026-09-11T08:00:00.000Z";

describe("3단계 파이프라인 매핑", () => {
  it("손대지 않은 draft/needs_repair 는 초안", () => {
    expect(stageOfEntry({ status: "draft", render_count: 0, created_at: t0, updated_at: t0 })).toBe("inbox");
    expect(stageOfEntry({ status: "needs_repair", render_count: 0, created_at: t0, updated_at: t0 })).toBe("inbox");
  });

  it("렌더가 있거나 updated_at 이 바뀐 draft 는 편집 중", () => {
    expect(stageOfEntry({ status: "draft", render_count: 4, created_at: t0, updated_at: t0 })).toBe("editing");
    expect(stageOfEntry({ status: "draft", render_count: 0, created_at: t0, updated_at: t1 })).toBe("editing");
  });

  it("approved/scheduled/publishing/failed 는 항상 편집 중, published 만 게시됨", () => {
    for (const s of ["approved", "scheduled", "publishing", "failed"] as const) expect(stageOfStatus(s, false)).toBe("editing");
    expect(stageOfStatus("published", false)).toBe("published");
  });

  it("isTouched 는 렌더 수 또는 갱신 시각으로 판단", () => {
    expect(isTouched({ render_count: 0, created_at: t0, updated_at: t0 })).toBe(false);
    expect(isTouched({ renders: [1], created_at: t0, updated_at: t0 })).toBe(true);
  });

  it("확인 필요 판정", () => {
    expect(needsAttention({ status: "failed", warnings: [] })).toBe(true);
    expect(needsAttention({ status: "draft", warnings: ["status_mismatch"] })).toBe(true);
    expect(needsAttention({ status: "draft", warnings: ["missing_render"] })).toBe(false);
  });

  it("배지 라벨", () => {
    expect(stageBadge("draft", false)).toEqual({ label: "초안", tone: "neutral" });
    expect(stageBadge("draft", true)).toEqual({ label: "편집 중", tone: "blue" });
    expect(stageBadge("scheduled", true).label).toBe("예약됨");
    expect(stageBadge("failed", true).tone).toBe("red");
    expect(stageBadge("published", true).label).toBe("게시됨");
  });
});
