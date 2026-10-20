import { describe, expect, it } from "vitest";
import { stepSlide } from "@/lib/client/slide-index";

describe("stepSlide", () => {
  it("첫 장에서 이전은 0에 머문다", () => expect(stepSlide(0, -1, 5)).toBe(0));
  it("마지막 장에서 다음은 마지막에 머문다", () => expect(stepSlide(4, 1, 5)).toBe(4));
  it("가운데에서는 한 칸 이동한다", () => expect(stepSlide(1, 1, 5)).toBe(2));
  it("1장짜리는 항상 0", () => expect(stepSlide(0, 1, 1)).toBe(0));
  it("0장이면 0", () => expect(stepSlide(0, 1, 0)).toBe(0));
});
