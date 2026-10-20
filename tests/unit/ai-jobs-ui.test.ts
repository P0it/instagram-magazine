import { describe, expect, it } from "vitest";
import { activeJobCount, errorHint, jobProgress, STAGE_LABEL } from "@/components/ai/job-progress";
import type { AiJob } from "@/types";

const job = (over: Partial<AiJob>): AiJob => ({
  id: "job-1", status: "running", stage: "analyze", calls: 0,
  input: { account_key: "a", brief: "b", format: "4:5", attachment_count: 0 },
  created_at: "2026-10-21T00:00:00Z", updated_at: "2026-10-21T00:00:00Z",
  ...over,
});

describe("jobProgress", () => {
  it("shows a queued job as waiting at step 0", () => {
    expect(jobProgress(job({ status: "queued" }))).toEqual({ index: 0, total: 5, label: "대기 중" });
  });

  it("maps the running stage to its step and Korean label", () => {
    expect(jobProgress(job({ stage: "review" }))).toEqual({ index: 3, total: 5, label: STAGE_LABEL.review });
    expect(STAGE_LABEL.review).toBe("검수");
    expect(jobProgress(job({ stage: "copy" })).index).toBe(1);
  });

  it("shows done as complete and keeps the last stage for failed and canceled jobs", () => {
    expect(jobProgress(job({ status: "done", stage: "save" }))).toEqual({ index: 5, total: 5, label: "완료" });
    expect(jobProgress(job({ status: "failed", stage: "layout" }))).toEqual({ index: 2, total: 5, label: "실패" });
    expect(jobProgress(job({ status: "canceled", stage: "copy" }))).toEqual({ index: 1, total: 5, label: "취소됨" });
  });
});

describe("activeJobCount", () => {
  it("counts queued and running jobs only", () => {
    expect(activeJobCount([job({ status: "queued" }), job({ status: "running" }), job({ status: "done" }), job({ status: "failed" })])).toBe(2);
  });
});

describe("errorHint", () => {
  it("points auth failures at the AI settings and quota failures at waiting", () => {
    expect(errorHint({ stage: "copy", kind: "auth", message: "x" })).toContain("설정");
    expect(errorHint({ stage: "copy", kind: "quota", message: "x" })).toContain("한도");
    expect(errorHint({ stage: "copy", kind: "interrupted", message: "x" })).toContain("다시 시도");
    expect(errorHint({ stage: "copy", kind: "internal", message: "x" })).toBe("");
  });
});
