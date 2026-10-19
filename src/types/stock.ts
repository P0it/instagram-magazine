import { z } from "zod";

export const StockProviderSchema = z.enum(["pexels", "unsplash"]);
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
