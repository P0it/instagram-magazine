import "server-only";
import type { InsightsRange, InsightsResponse } from "@/types";
import type { DriveClient } from "@/lib/drive/types";
import { readChannels, readIndexFile } from "@/lib/drive/system-files";
import { listPublicAccounts } from "@/lib/instagram/accounts";
import { listInsightAccountKeys, readInsights } from "./store";
import { summarizeInsights } from "./summarize";

/** 스냅샷 파일 + index.json + channels/accounts → 화면용 응답 */
export async function queryInsights(drive: DriveClient, range: InsightsRange, now = Date.now()): Promise<InsightsResponse> {
  const [keys, { data: index }, { data: channels }, accounts] = await Promise.all([
    listInsightAccountKeys(drive),
    readIndexFile(drive),
    readChannels(drive),
    listPublicAccounts(drive),
  ]);
  // 채널에 연결된 계정 키는 파일이 없어도 빈 요약으로 노출 (연결 전 안내용)
  const wanted = new Set<string>([...keys, ...channels.channels.flatMap((c) => (c.instagram_account_key ? [c.instagram_account_key] : []))]);
  const files = await Promise.all([...wanted].map((k) => readInsights(drive, k)));
  return summarizeInsights({ files, index: index.posts, channels: channels.channels, accounts, range, now });
}
