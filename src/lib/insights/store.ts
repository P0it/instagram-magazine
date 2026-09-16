import "server-only";
import { InsightsFileSchema, type InsightsFile } from "@/types";
import type { DriveClient } from "@/lib/drive/types";
import { systemFolderId } from "@/lib/drive/paths";

/** `_system/insights/` 폴더. 계정당 파일 하나(`<account_key>.json`). DB 없음. */
async function insightsFolderId(drive: DriveClient): Promise<string> {
  const sys = await systemFolderId(drive);
  const f = await drive.ensureFolder(sys, ["insights"]);
  return f.id;
}

export const MAX_DAYS = 400;

export function emptyInsights(accountKey: string): InsightsFile {
  return InsightsFileSchema.parse({ account_key: accountKey });
}

export async function readInsights(drive: DriveClient, accountKey: string): Promise<InsightsFile> {
  const folder = await insightsFolderId(drive);
  const f = await drive.findChild(folder, `${accountKey}.json`);
  if (!f) return emptyInsights(accountKey);
  try {
    const parsed = InsightsFileSchema.safeParse(JSON.parse(await drive.readText(f.id)));
    if (parsed.success) return parsed.data;
    console.warn(`[insights] ${accountKey}.json invalid, using empty:`, parsed.error.issues.slice(0, 3));
  } catch (e) {
    console.warn(`[insights] ${accountKey}.json unreadable:`, e);
  }
  return emptyInsights(accountKey);
}

export async function writeInsights(drive: DriveClient, data: InsightsFile): Promise<void> {
  const folder = await insightsFolderId(drive);
  const trimmed: InsightsFile = { ...data, days: sortDays(data.days).slice(-MAX_DAYS) };
  await drive.writeText(folder, `${data.account_key}.json`, JSON.stringify(trimmed, null, 2), "application/json");
}

export async function listInsightAccountKeys(drive: DriveClient): Promise<string[]> {
  const folder = await insightsFolderId(drive);
  const children = await drive.listChildren(folder);
  return children.filter((c) => c.name.endsWith(".json")).map((c) => c.name.slice(0, -5));
}

export function sortDays<T extends { date: string }>(days: T[]): T[] {
  return [...days].sort((a, b) => a.date.localeCompare(b.date));
}

/** 같은 날짜가 있으면 교체, 없으면 추가 */
export function upsertDay(days: InsightsFile["days"], day: InsightsFile["days"][number]): InsightsFile["days"] {
  const rest = days.filter((d) => d.date !== day.date);
  return sortDays([...rest, day]);
}
