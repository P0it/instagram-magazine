import "server-only";
import { createHash } from "node:crypto";
import { CHANNEL_KEYS, type IngestLogEntry, type SyncResponse } from "@/types";
import type { DriveClient } from "@/lib/drive/types";
import { inboxFolderId } from "@/lib/drive/paths";
import { readChannels, readIngestLog, writeIngestLog } from "@/lib/drive/system-files";
import { rebuildIndex } from "@/lib/metadata/index-builder";
import { groupInboxFiles } from "./group";
import { normalizeGroup } from "./normalize";

export const INGEST_LOG_MAX = 200;
export const AUTO_SYNC_INTERVAL_MS = 30 * 60 * 1000;

function fingerprint(files: { id: string; md5: string | null }[]): string {
  const h = createHash("sha1");
  for (const f of [...files].sort((a, b) => a.id.localeCompare(b.id))) h.update(`${f.id}:${f.md5 ?? ""};`);
  return h.digest("hex");
}

/** inbox 전체 스캔 → 정규화 → index 재생성. 멱등(fingerprint). */
export async function syncInbox(drive: DriveClient): Promise<SyncResponse> {
  const now = new Date();
  const nowIso = now.toISOString();
  const { data: channelsFile } = await readChannels(drive);
  const log = await readIngestLog(drive);
  const seen = new Set(log.data.entries.filter((e) => e.result !== "error").map((e) => e.source_fingerprint));

  const entries: IngestLogEntry[] = [];
  let created = 0, needsRepair = 0, skipped = 0, errors = 0;

  for (const channel of CHANNEL_KEYS) {
    const channelConfig = channelsFile.channels.find((c) => c.key === channel);
    const inboxId = await inboxFolderId(drive, channel);
    const files = await drive.listChildren(inboxId);
    const groups = groupInboxFiles(files.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType })));

    for (const group of groups) {
      const ids = [
        ...(group.markdownFileId ? [group.markdownFileId] : []),
        ...group.imageFileIds.map((i) => i.fileId),
        ...group.otherFileIds.map((o) => o.fileId),
      ];
      const fp = fingerprint(files.filter((f) => ids.includes(f.id)).map((f) => ({ id: f.id, md5: f.md5Checksum })));
      if (seen.has(fp)) {
        skipped++;
        entries.push({ at: nowIso, channel, prefix: group.prefix, source_fingerprint: fp, result: "skipped", post_id: null, message: "already ingested" });
        continue;
      }
      try {
        const res = await normalizeGroup(drive, channel, channelConfig, group, inboxId, now);
        if (res.status === "draft") created++;
        else needsRepair++;
        entries.push({
          at: nowIso, channel, prefix: group.prefix, source_fingerprint: fp,
          result: res.status === "draft" ? "created" : "needs_repair",
          post_id: res.postId, message: res.problems.join(" | "),
        });
      } catch (e) {
        errors++;
        entries.push({ at: nowIso, channel, prefix: group.prefix, source_fingerprint: fp, result: "error", post_id: null, message: String(e) });
      }
    }
  }

  const merged = [...entries, ...log.data.entries].slice(0, INGEST_LOG_MAX);
  await writeIngestLog(drive, { last_sync_at: nowIso, entries: merged });
  await rebuildIndex(drive);

  return { synced_at: nowIso, created, needs_repair: needsRepair, skipped, errors, entries };
}

export async function lastSyncAt(drive: DriveClient): Promise<string | null> {
  return (await readIngestLog(drive)).data.last_sync_at;
}

export function shouldAutoSync(lastSync: string | null, now = Date.now()): boolean {
  if (!lastSync) return true;
  const t = Date.parse(lastSync);
  return Number.isNaN(t) || now - t > AUTO_SYNC_INTERVAL_MS;
}
