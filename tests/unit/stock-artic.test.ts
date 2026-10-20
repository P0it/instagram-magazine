import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStockImage, searchStock, stockProviders } from "@/lib/stock";

afterEach(() => vi.unstubAllGlobals());

describe("stock — Art Institute (퍼블릭 도메인)", () => {
  it("키가 없어도 artic 은 항상 쓸 수 있다", () => {
    vi.stubEnv("PEXELS_API_KEY", "");
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "");
    expect(stockProviders()).toEqual(["artic"]);
  });

  it("검색 결과를 StockPhoto 로 옮기고 이미지 없는 작품은 거른다", async () => {
    vi.stubEnv("PEXELS_API_KEY", "");
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "");
    const fetchMock = vi.fn(async () =>
      Response.json({
        pagination: { total_pages: 3 },
        data: [
          { id: 1, title: "Winter: Cat on a Cushion", artist_display: "Théophile-Alexandre Steinlen\nFrench", image_id: "abc", thumbnail: { width: 2928, height: 2250 } },
          { id: 2, title: "No image", artist_display: null, image_id: null, thumbnail: null },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await searchStock("cat", 1);
    expect(r.configured).toBe(true);
    expect(r.hasMore).toBe(true);
    expect(r.photos).toHaveLength(1);
    expect(r.photos[0]).toMatchObject({ id: "artic-1", provider: "artic", author: "Théophile-Alexandre Steinlen", license: "CC0 · 퍼블릭 도메인" });
    expect(r.photos[0].full).toBe("https://www.artic.edu/iiif/2/abc/full/1686,/0/default.jpg");
    const called = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(decodeURIComponent(called)).toContain("query[term][is_public_domain]=true");
  });

  it("허용 호스트 밖 이미지는 가져오지 않는다", async () => {
    await expect(fetchStockImage("https://evil.example.com/a.jpg")).rejects.toThrow("host not allowed");
  });
});
