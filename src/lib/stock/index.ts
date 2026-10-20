import "server-only";
import { z } from "zod";
import type { StockPhoto, StockProvider, StockSearchResult } from "@/types/stock";

/**
 * 스톡 사진 검색(Pexels / Unsplash / Art Institute of Chicago 퍼블릭 도메인). 키는 서버 환경변수에만 둔다 — 브라우저에는 결과만 내려간다.
 * Pexels·Unsplash 키가 없어도 artic(키 불필요, CC0)은 항상 쓸 수 있다.
 */
export type { StockPhoto, StockProvider, StockSearchResult };

const ALLOWED_IMAGE_HOSTS = ["images.pexels.com", "images.unsplash.com", "www.artic.edu"];
const ALLOWED_TRACK_HOSTS = ["api.unsplash.com"];

const pexelsKey = () => process.env.PEXELS_API_KEY ?? "";
const unsplashKey = () => process.env.UNSPLASH_ACCESS_KEY ?? "";

export function stockProviders(): StockProvider[] {
  const out: StockProvider[] = [];
  if (pexelsKey()) out.push("pexels");
  if (unsplashKey()) out.push("unsplash");
  out.push("artic");
  return out;
}

const PexelsResponse = z.object({
  photos: z.array(
    z.object({
      id: z.number(),
      width: z.number(),
      height: z.number(),
      url: z.string(),
      photographer: z.string(),
      photographer_url: z.string(),
      src: z.object({ large2x: z.string(), medium: z.string() }),
    }),
  ),
  next_page: z.string().optional(),
});

const UnsplashResponse = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      width: z.number(),
      height: z.number(),
      urls: z.object({ regular: z.string(), small: z.string() }),
      links: z.object({ html: z.string(), download_location: z.string() }),
      user: z.object({ name: z.string(), links: z.object({ html: z.string() }) }),
    }),
  ),
  total_pages: z.number().default(1),
});

const ArticResponse = z.object({
  pagination: z.object({ total_pages: z.number().default(1) }),
  data: z.array(
    z.object({
      id: z.number(),
      title: z.string().nullable().default(""),
      artist_display: z.string().nullable().default(""),
      image_id: z.string().nullable(),
      thumbnail: z.object({ width: z.number(), height: z.number() }).nullable().default(null),
    }),
  ),
});

const PER_PAGE = 24;

/** Art Institute of Chicago — 퍼블릭 도메인(CC0)만. 빈티지 판화·포스터·회화라 유머·해학 톤 배경에 좋다 */
async function searchArtic(q: string, page: number): Promise<{ photos: StockPhoto[]; hasMore: boolean }> {
  const params = new URLSearchParams({ q, page: String(page), limit: String(PER_PAGE), fields: "id,title,artist_display,image_id,thumbnail" });
  params.set("query[term][is_public_domain]", "true");
  const res = await fetch(`https://api.artic.edu/api/v1/artworks/search?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Art Institute ${res.status}`);
  const data = ArticResponse.parse(await res.json());
  const photos: StockPhoto[] = [];
  for (const a of data.data) {
    if (!a.image_id) continue;
    const iiif = `https://www.artic.edu/iiif/2/${a.image_id}/full`;
    photos.push({
      id: `artic-${a.id}`,
      provider: "artic",
      thumb: `${iiif}/400,/0/default.jpg`,
      full: `${iiif}/1686,/0/default.jpg`,
      width: a.thumbnail?.width ?? 1000,
      height: a.thumbnail?.height ?? 1000,
      author: (a.artist_display ?? "").split("\n")[0] || a.title || "Unknown",
      authorUrl: `https://www.artic.edu/artworks/${a.id}`,
      pageUrl: `https://www.artic.edu/artworks/${a.id}`,
      license: "CC0 · 퍼블릭 도메인",
    });
  }
  return { photos, hasMore: page < data.pagination.total_pages };
}

async function searchPexels(q: string, page: number): Promise<{ photos: StockPhoto[]; hasMore: boolean }> {
  const url = `https://api.pexels.com/v1/search?${new URLSearchParams({ query: q, per_page: String(PER_PAGE), page: String(page), locale: "ko-KR" })}`;
  const res = await fetch(url, { headers: { Authorization: pexelsKey() }, cache: "no-store" });
  if (!res.ok) throw new Error(`Pexels ${res.status}`);
  const data = PexelsResponse.parse(await res.json());
  return {
    hasMore: !!data.next_page,
    photos: data.photos.map((p) => ({
      id: `pexels-${p.id}`,
      provider: "pexels" as const,
      thumb: p.src.medium,
      full: p.src.large2x,
      width: p.width,
      height: p.height,
      author: p.photographer,
      authorUrl: p.photographer_url,
      pageUrl: p.url,
    })),
  };
}

async function searchUnsplash(q: string, page: number): Promise<{ photos: StockPhoto[]; hasMore: boolean }> {
  const url = `https://api.unsplash.com/search/photos?${new URLSearchParams({ query: q, per_page: String(PER_PAGE), page: String(page) })}`;
  const res = await fetch(url, { headers: { Authorization: `Client-ID ${unsplashKey()}`, "Accept-Version": "v1" }, cache: "no-store" });
  if (!res.ok) throw new Error(`Unsplash ${res.status}`);
  const data = UnsplashResponse.parse(await res.json());
  return {
    hasMore: page < data.total_pages,
    photos: data.results.map((p) => ({
      id: `unsplash-${p.id}`,
      provider: "unsplash" as const,
      thumb: p.urls.small,
      full: p.urls.regular,
      width: p.width,
      height: p.height,
      author: p.user.name,
      authorUrl: p.user.links.html,
      pageUrl: p.links.html,
      downloadLocation: p.links.download_location,
    })),
  };
}

export async function searchStock(q: string, page: number, provider?: StockProvider): Promise<StockSearchResult> {
  const providers = stockProviders();
  const use = provider && providers.includes(provider) ? provider : providers[0];
  const r = use === "pexels" ? await searchPexels(q, page) : use === "unsplash" ? await searchUnsplash(q, page) : await searchArtic(q, page);
  return { configured: true, providers, photos: r.photos, page, hasMore: r.hasMore };
}

export class StockImportError extends Error {}

/** 스톡 이미지 URL 을 서버가 직접 받는다. 호스트 허용 목록 밖이면 거부 (SSRF 방지) */
export async function fetchStockImage(url: string): Promise<{ bytes: Uint8Array; mime: string }> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new StockImportError("invalid url");
  }
  if (u.protocol !== "https:" || !ALLOWED_IMAGE_HOSTS.includes(u.hostname)) throw new StockImportError("host not allowed");
  const res = await fetch(u, { cache: "no-store" });
  if (!res.ok) throw new StockImportError(`image fetch ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > 15 * 1024 * 1024) throw new StockImportError("image too large");
  return { bytes, mime: res.headers.get("content-type")?.split(";")[0] ?? "" };
}

/** Unsplash 약관상 사진을 쓸 때 download_location 을 한 번 호출한다 (실패해도 무시) */
export async function trackUnsplashDownload(downloadLocation: string): Promise<void> {
  try {
    const u = new URL(downloadLocation);
    if (u.protocol !== "https:" || !ALLOWED_TRACK_HOSTS.includes(u.hostname) || !unsplashKey()) return;
    await fetch(u, { headers: { Authorization: `Client-ID ${unsplashKey()}` }, cache: "no-store" });
  } catch {
    /* 추적 실패는 무시 */
  }
}
