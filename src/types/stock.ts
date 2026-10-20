import { z } from "zod";

export const StockProviderSchema = z.enum(["pexels", "unsplash", "artic", "library"]);
export type StockProvider = z.infer<typeof StockProviderSchema>;

export const StockPhotoSchema = z.object({
  id: z.string(),
  provider: StockProviderSchema,
  thumb: z.string(),
  full: z.string(),
  width: z.number(),
  height: z.number(),
  author: z.string(),
  authorUrl: z.string(),
  pageUrl: z.string(),
  /** provider=library 일 때 모아둔 사진 id (가져올 때 서버가 Drive 에서 읽는다) */
  libraryId: z.string().optional(),
  /** 라이선스 한 줄 (예: "CC0 · 퍼블릭 도메인"). 스톡 약관 사진은 비움 */
  license: z.string().optional(),
  /** Unsplash 약관: 사진을 실제로 쓸 때 호출해야 하는 다운로드 트래킹 URL */
  downloadLocation: z.string().optional(),
});
export type StockPhoto = z.infer<typeof StockPhotoSchema>;

export const StockSearchResultSchema = z.object({
  configured: z.boolean(),
  providers: z.array(StockProviderSchema),
  photos: z.array(StockPhotoSchema),
  page: z.number(),
  hasMore: z.boolean(),
});
export type StockSearchResult = z.infer<typeof StockSearchResultSchema>;
