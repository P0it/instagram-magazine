import "server-only";
import type { CollectResult, InsightsFile, MediaInsight } from "@/types";
import type { DriveClient } from "@/lib/drive/types";
import { readAccounts, readIndexFile } from "@/lib/drive/system-files";
import { accessTokenOf } from "@/lib/instagram/accounts";
import { getAccountDayMetrics, getMediaMetrics, getProfileCounts } from "@/lib/instagram/client";
import { readInsights, upsertDay, writeInsights } from "./store";

/** 게시물 지표는 게시 후 이 기간 동안만 갱신 (그 뒤엔 거의 안 변함 → 호출 절약) */
const MEDIA_REFRESH_DAYS = 60;

export function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * 모든 연결 계정의 인사이트를 수집해 `_system/insights/<key>.json` 에 반영.
 * - 계정: 어제(UTC) 하루치 reach/views/profile_views + 현재 팔로워 수
 * - 게시물: index.json 의 published 중 ig_media_id 있는 것 (최근 60일)
 * 실패는 계정 단위로 격리하고 last_error 에 남긴다. 절대 던지지 않음.
 */
export async function collectInsights(drive: DriveClient, now = Date.now(), f: typeof fetch = fetch): Promise<CollectResult> {
  const [{ data: accountsFile }, { data: index }] = await Promise.all([readAccounts(drive), readIndexFile(drive)]);
  const collectedAt = new Date(now).toISOString();
  const results: CollectResult["accounts"] = [];

  for (const account of accountsFile.accounts) {
    const file = await readInsights(drive, account.key);
    let mediaUpdated = 0;
    try {
      const token = accessTokenOf(account);
      const profile = await getProfileCounts(account.ig_user_id, token, f);

      // 어제 00:00 ~ 오늘 00:00 (UTC). 오늘 것은 아직 집계 중이라 어제를 확정치로 기록.
      const todayStart = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
      const yStart = todayStart - 86_400_000;
      const day = await getAccountDayMetrics(account.ig_user_id, token, Math.floor(yStart / 1000), Math.floor(todayStart / 1000), f);
      let days = upsertDay(file.days, { date: utcDate(yStart), followers: profile.followers, ...day });
      // 오늘 행은 팔로워만 최신으로 (도달 등은 어제 값 유지 → 그래프 끊김 방지)
      const today = days.find((d) => d.date === utcDate(todayStart));
      days = upsertDay(days, { date: utcDate(todayStart), followers: profile.followers, reach: today?.reach ?? 0, views: today?.views ?? 0, profile_views: today?.profile_views ?? 0 });

      const media = new Map(file.media.map((m) => [m.ig_media_id, m]));
      const targets = index.posts.filter(
        (p) => p.status === "published" && p.ig_media_id && p.account_key === account.key && p.published_at && now - Date.parse(p.published_at) < MEDIA_REFRESH_DAYS * 86_400_000,
      );
      for (const p of targets) {
        try {
          const m = await getMediaMetrics(p.ig_media_id!, token, f);
          const row: MediaInsight = { ig_media_id: p.ig_media_id!, post_id: p.post_id, ...m, collected_at: collectedAt };
          media.set(row.ig_media_id, row);
          mediaUpdated++;
        } catch (e) {
          console.warn(`[insights] media ${p.ig_media_id} failed:`, e);
        }
      }

      const next: InsightsFile = { ...file, ig_user_id: account.ig_user_id, last_collected_at: collectedAt, last_error: null, days, media: [...media.values()] };
      await writeInsights(drive, next);
      results.push({ account_key: account.key, ok: true, media_updated: mediaUpdated, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await writeInsights(drive, { ...file, last_error: msg });
      results.push({ account_key: account.key, ok: false, media_updated: mediaUpdated, error: msg });
    }
  }
  return { collected_at: collectedAt, accounts: results };
}
