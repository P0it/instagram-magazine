import { describe, expect, it } from "vitest";
import { CAPTION_MAX, HASHTAG_MAX } from "@/lib/metadata/approval-gate";
import { estimateLines, loadSpec, specPromptBlock, validateAgainstSpec } from "@/lib/ai/spec";
import type { GeneratedCarousel, GeneratedSlide } from "@/types";

const info = (text: string, preset: GeneratedSlide["preset"] = "info-dark"): GeneratedSlide => ({ role: "info", text, preset });
const good = (over: Partial<GeneratedCarousel> = {}): GeneratedCarousel => ({
  headline: "봄 카페 3곳",
  topic: "카페",
  caption: "저장해 두세요",
  hashtags: ["카페", "서울"],
  slides: [
    { role: "cover", text: "봄 카페 3곳", preset: "cover-center" },
    info("첫째, 성수 한적한 골목"),
    { role: "closing", text: "저장하고 다음에 가요", preset: "closing-slide" },
  ],
  ...over,
});
const codes = (c: GeneratedCarousel) => validateAgainstSpec(c, "4:5").map((v) => v.code);

describe("ai spec", () => {
  it("loads and keeps caption/hashtag limits equal to the approval gate", () => {
    const s = loadSpec();
    expect(s.instagram.caption_max).toBe(CAPTION_MAX);
    expect(s.instagram.hashtag_max).toBe(HASHTAG_MAX);
  });

  it("accepts a well-formed 3 slide carousel", () => {
    expect(validateAgainstSpec(good(), "4:5")).toEqual([]);
  });

  it("flags slide counts outside the carousel range", () => {
    const one = good({ slides: [good().slides[0]!] });
    const eleven = good({ slides: [good().slides[0]!, ...Array.from({ length: 10 }, () => info("본문")) ] });
    expect(codes(one)).toContain("slide_count");
    expect(codes(eleven)).toContain("slide_count");
  });

  it("flags a long unbroken Korean headline on a narrow cover preset as overflow", () => {
    const c = good();
    c.slides[0] = { role: "cover", text: "가".repeat(60), preset: "cover-center" };
    const v = validateAgainstSpec(c, "4:5");
    expect(v.find((x) => x.code === "overflow")?.slide).toBe(0);
  });

  it("counts emoji as two em when estimating lines", () => {
    // 쓸 수 있는 폭 950 · 글자 100 → 한 줄에 최대 9.5em. 이모지(2em)는 4개씩, 1em 으로 세면 9개씩.
    expect(estimateLines("😀".repeat(5), 100, 950)).toBe(2);
    expect(estimateLines("가".repeat(9), 100, 950)).toBe(1);
  });

  it("flags a font size under the readable floor", () => {
    const c = good();
    c.slides[1] = { ...info("작은 글씨"), overrides: { defaultFontSize: 12 } };
    expect(codes(c)).toContain("font_too_small");
  });

  it("flags more than the hashtag limit and an over-long caption", () => {
    expect(codes(good({ hashtags: Array.from({ length: HASHTAG_MAX + 1 }, (_, i) => `t${i}`) }))).toContain("hashtag_count");
    expect(codes(good({ caption: "가".repeat(CAPTION_MAX + 1) }))).toContain("caption_too_long");
  });

  it("flags empty text and a misplaced cover/closing", () => {
    const c = good();
    c.slides[1] = info("   ");
    expect(codes(c)).toContain("empty_text");
    const swapped = good({ slides: [good().slides[1]!, good().slides[0]!, good().slides[2]!] });
    expect(codes(swapped)).toContain("role_order");
  });

  it("puts the canvas size for the format into the prompt block", () => {
    expect(specPromptBlock("4:5")).toContain("1350");
    expect(specPromptBlock("1:1")).toContain("1080 × 1080");
  });
});
