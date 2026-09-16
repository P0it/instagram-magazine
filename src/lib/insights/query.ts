import "server-only";
import type { InsightsRange, InsightsResponse } from "@/types";
import type { DriveClient } from "@/lib/drive/types";
import { readIndexFile } from "@/lib/drive/system-files";
import { listPublicAccounts } from "@/lib/instagram/accounts";
import { listInsightAccountKeys, readInsights } from "./store";
import { summarizeInsights } from "./summarize";

/** 스냅샷 파일 + index.json + accounts → 화면용 응답 */
export async function queryInsights(drive: DriveClient, range: InsightsRange, now = Date.now()): Promise<InsightsResponse> {
  const [keys, { data: index }, accounts] = await Promise.all([
    listInsightAccountKeys(drive),
    readIndexFile(drive),
    listPublicAccounts(drive),
  ]);
  // 연결된 계정은 스냅샷이 없어도 빈 요약으로 노출 (수집 전 안내용)
  const wanted = new Set<string>([...keys, ...accounts.map((a) => a.key)]);
  const files = await Promise.all([...wanted].map((k) => readInsights(drive, k)));
  return summarizeInsights({ files, index: index.posts, accounts, range, now });
}
