import { describe, expect, it } from "vitest";
import { NAV_ITEMS, activeNavKey } from "@/components/shell/nav-items";

describe("activeNavKey", () => {
  it.each([
    ["/references", "references"],
    ["/references/abc", "references"],
    ["/templates", "templates"],
    ["/home", "create"],
    ["/library", "create"],
    ["/dashboard", "create"],
    ["/queue", "queue"],
    ["/settings/drive", "settings"],
    ["/nope", null],
  ])("%s → %s", (path, key) => {
    expect(activeNavKey(path)).toBe(key);
  });

  it("메뉴 순서와 경로는 고정이다", () => {
    expect(NAV_ITEMS.map((i) => i.href)).toEqual(["/references", "/templates", "/home", "/queue", "/settings"]);
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(["레퍼런스", "템플릿", "콘텐츠 만들기", "게시 큐", "설정"]);
  });
});
