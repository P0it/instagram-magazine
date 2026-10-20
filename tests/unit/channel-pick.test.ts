import { describe, expect, it } from "vitest";
import { pickChannel, nextChannel } from "@/lib/client/channel-pick";

const keys = ["a.one", "b.two", "c.three"];

describe("pickChannel", () => {
  it("URL 의 ch 가 목록에 있으면 그것을 쓴다", () => {
    expect(pickChannel(keys, "b.two", "c.three")).toBe("b.two");
  });
  it("URL 에 없으면 마지막으로 고른 계정을 쓴다", () => {
    expect(pickChannel(keys, null, "c.three")).toBe("c.three");
  });
  it("URL 값이 목록에 없으면(연결 해제됨) 기억해 둔 계정으로", () => {
    expect(pickChannel(keys, "gone", "b.two")).toBe("b.two");
  });
  it("기억한 계정도 없으면 첫 계정, 계정이 없으면 null", () => {
    expect(pickChannel(keys, null, "gone")).toBe("a.one");
    expect(pickChannel([], "a.one", "a.one")).toBeNull();
  });
});

describe("nextChannel", () => {
  it("다음 계정으로 돌아가며 이동한다", () => {
    expect(nextChannel(keys, "a.one", 1)).toBe("b.two");
    expect(nextChannel(keys, "c.three", 1)).toBe("a.one");
    expect(nextChannel(keys, "a.one", -1)).toBe("c.three");
  });
  it("계정이 1개 이하면 그대로", () => {
    expect(nextChannel(["x"], "x", 1)).toBe("x");
    expect(nextChannel([], null, 1)).toBeNull();
  });
});
