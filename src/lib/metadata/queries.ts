import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { IndexFile } from "@/types";
import { getDrive } from "@/lib/drive";
import { INDEX_CACHE_TAG, readIndex } from "./index-builder";

/** index.json 을 60초 캐시. 쓰기 경로는 invalidateIndexCache() 로 태그 무효화. */
export async function getCachedIndex(): Promise<IndexFile> {
  "use cache";
  cacheTag(INDEX_CACHE_TAG);
  cacheLife({ stale: 60, revalidate: 60, expire: 300 });
  const drive = await getDrive();
  return readIndex(drive);
}
