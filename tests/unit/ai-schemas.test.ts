import { describe, expect, it } from "vitest";
import {
  AiJobInputSchema,
  AiJobSchema,
  AiJobsFileSchema,
  AiProviderStatusSchema,
  GeneratedCarouselSchema,
  PostMetadataSchema,
} from "@/types";

const slide = { role: "cover", text: "제목", preset: "cover-center" } as const;
const carousel = { headline: "h", topic: "t", caption: "c", hashtags: ["a"], slides: [slide, { ...slide, role: "info", preset: "info-dark" }] };
const meta = { post_id: "p", channel: "acc", created_at: "2026-10-21T00:00:00Z", updated_at: "2026-10-21T00:00:00Z" };

describe("ai schemas", () => {
  it("defaults the job input format to 4:5", () => {
    expect(AiJobInputSchema.parse({ account_key: "a", brief: "x", attachment_count: 0 }).format).toBe("4:5");
  });

  it("rejects slide_count outside 3..10", () => {
    const base = { account_key: "a", brief: "x", attachment_count: 0 };
    expect(AiJobInputSchema.safeParse({ ...base, slide_count: 2 }).success).toBe(false);
    expect(AiJobInputSchema.safeParse({ ...base, slide_count: 11 }).success).toBe(false);
    expect(AiJobInputSchema.safeParse({ ...base, slide_count: 3 }).success).toBe(true);
  });

  it("rejects an unknown preset id in a generated carousel", () => {
    expect(GeneratedCarouselSchema.safeParse(carousel).success).toBe(true);
    const bad = { ...carousel, slides: [{ ...slide, preset: "nope" }] };
    expect(GeneratedCarouselSchema.safeParse(bad).success).toBe(false);
  });

  it("parses legacy metadata without generation", () => {
    const m = PostMetadataSchema.parse(meta);
    expect(m.generation).toBeUndefined();
  });

  it("round-trips metadata with generation", () => {
    const generation = { brief: "b", provider: "claude", spec_version: "1", generated_at: "2026-10-21T00:00:00Z" };
    const m = PostMetadataSchema.parse({ ...meta, generation });
    expect(PostMetadataSchema.parse(JSON.parse(JSON.stringify(m))).generation).toEqual(generation);
  });

  it("parses a job file and a provider status", () => {
    const job = {
      id: "job-1", status: "queued", stage: "analyze", calls: 0,
      input: { account_key: "a", brief: "x", attachment_count: 0 },
      created_at: "2026-10-21T00:00:00Z", updated_at: "2026-10-21T00:00:00Z",
    };
    expect(AiJobSchema.parse(job).input.format).toBe("4:5");
    expect(AiJobsFileSchema.parse({}).jobs).toEqual([]);
    expect(AiProviderStatusSchema.parse({ id: "claude", connected: false, kind: "oauth", supports_images: true }).connected).toBe(false);
  });
});
