import { describe, expect, it } from "vitest";
import { canTransition, folderForStatus, isStaleLock, statusForFolder, TRANSITIONS } from "@/lib/metadata/transitions";
import { evaluateApprovalGate, fullCaption } from "@/lib/metadata/approval-gate";
import { PostMetadataSchema, SourcesFileSchema, type PostStatus } from "@/types";

describe("state machine", () => {
  it("allows documented transitions", () => {
    expect(canTransition("needs_repair", "draft")).toBe(true);
    expect(canTransition("draft", "approved")).toBe(true);
    expect(canTransition("approved", "draft")).toBe(true);
    expect(canTransition("approved", "scheduled")).toBe(true);
    expect(canTransition("scheduled", "approved")).toBe(true);
    expect(canTransition("approved", "publishing")).toBe(true);
    expect(canTransition("scheduled", "publishing")).toBe(true);
    expect(canTransition("publishing", "published")).toBe(true);
    expect(canTransition("publishing", "failed")).toBe(true);
    expect(canTransition("failed", "approved")).toBe(true);
  });
  it("blocks illegal transitions", () => {
    expect(canTransition("draft", "published")).toBe(false);
    expect(canTransition("published", "draft")).toBe(false);
    expect(canTransition("needs_repair", "approved")).toBe(false);
    expect(canTransition("failed", "publishing")).toBe(false);
  });
  it("published is terminal", () => {
    expect(TRANSITIONS.published).toEqual([]);
  });
  it("folder mapping", () => {
    const all: PostStatus[] = ["needs_repair", "draft", "approved", "scheduled", "publishing", "published", "failed"];
    expect(all.map(folderForStatus)).toEqual(["draft", "draft", "approved", "approved", "approved", "published", "approved"]);
    expect(statusForFolder("approved")).toBe("approved");
  });
  it("stale lock after 10 minutes", () => {
    const now = Date.parse("2026-09-11T10:00:00Z");
    expect(isStaleLock("2026-09-11T09:55:00Z", now)).toBe(false);
    expect(isStaleLock("2026-09-11T09:45:00Z", now)).toBe(true);
    expect(isStaleLock(undefined, now)).toBe(false);
  });
});

describe("approval gate", () => {
  const base = PostMetadataSchema.parse({
    post_id: "p", channel: "LIFE", headline: "h", caption: "c", hashtags: ["a"],
    slides: [{ id: "s1" }, { id: "s2" }], fact_check_required: true, created_at: "a", updated_at: "b",
  });
  const ok = { width: 1080, height: 1350, format: "jpeg" as const };

  it("passes when all conditions met", () => {
    const r = evaluateApprovalGate({ metadata: base, sources: SourcesFileSchema.parse({ fact_check_status: "approved" }), renderDims: [ok, ok] });
    expect(r.ok).toBe(true);
  });
  it("fails on render count and dims", () => {
    const r = evaluateApprovalGate({ metadata: base, sources: SourcesFileSchema.parse({ fact_check_status: "approved" }), renderDims: [ok, { width: 1080, height: 1080, format: "jpeg" }] });
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.id === "render_dimensions")?.ok).toBe(false);
    expect(r.checks.find((c) => c.id === "render_count")?.ok).toBe(true);
  });
  it("LIFE requires fact check approved", () => {
    const r = evaluateApprovalGate({ metadata: base, sources: SourcesFileSchema.parse({}), renderDims: [ok, ok] });
    expect(r.checks.find((c) => c.id === "fact_check")?.ok).toBe(false);
    const r2 = evaluateApprovalGate({ metadata: { ...base, fact_check_required: false }, sources: SourcesFileSchema.parse({}), renderDims: [ok, ok] });
    expect(r2.checks.find((c) => c.id === "fact_check")?.ok).toBe(true);
  });
  it("caption and hashtag limits", () => {
    const long = { ...base, caption: "x".repeat(2300), hashtags: Array.from({ length: 31 }, (_, i) => `t${i}`) };
    const r = evaluateApprovalGate({ metadata: long, sources: SourcesFileSchema.parse({ fact_check_status: "approved" }), renderDims: [ok, ok] });
    expect(r.checks.find((c) => c.id === "caption_length")?.ok).toBe(false);
    expect(r.checks.find((c) => c.id === "hashtag_count")?.ok).toBe(false);
  });
  it("fullCaption prefixes hashtags", () => {
    expect(fullCaption({ ...base, caption: "hi", hashtags: ["a", "#b"] })).toBe("hi\n\n#a #b");
  });
});
