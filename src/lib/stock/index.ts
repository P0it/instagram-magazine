import "server-only";
import { z } from "zod";
import type { StockPhoto, StockProvider, StockSearchResult } from "@/types/stock";

/**
 * 스톡 사진 검색(Pexels / Unsplash). 키는 서버 환경변수에만 둔다 — 브라우저에는 결과만 내려간다.
 * 키가 둘 다 없으면 configured=false 로 UI 에 안내만 한다.
 */
export type { StockPhoto, StockProvider, StockSearchResult };

const ALLOWED_IMAGE_HOSTS = ["images.pexels.com", "images.unsplash.com"];
const ALLOWED_TRACK_HOSTS = ["api.unsplash.com"];

const pexelsKey = () => process.env.PEXELS_API_KEY ?? "";
const unsplashKey = () => process.env.UNSPLASH_ACCESS_KEY ?? "";

export function stockProviders(): StockProvider[] {
  const out: StockProvider[] = [];
  if (pexelsKey()) out.push("pexels");
  if (unsplashKey()) out.push("unsplash");
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

const PER_PAGE = 24;

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
  if (providers.length === 0) return { configured: false, providers, photos: [], page, hasMore: false };
  const use = provider && providers.includes(provider) ? provider : providers[0];
  const r = use === "pexels" ? await searchPexels(q, page) : await searchUnsplash(q, page);
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
