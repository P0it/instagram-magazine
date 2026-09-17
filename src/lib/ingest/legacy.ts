import "server-only";
import type { InboxGroup, IngestLogEntry } from "@/types";
import type { DriveClient, DriveFile } from "@/lib/drive/types";
import { FOLDER_MIME, GDOC_MIME } from "@/lib/drive/types";
import { readIngestLog, writeIngestLog } from "@/lib/drive/system-files";
import { getAccount, listAccounts } from "@/lib/instagram/accounts";
import { rebuildIndex } from "@/lib/metadata/index-builder";
import { INGEST_LOG_MAX } from "./sync";
import { groupInboxFiles, parseDraftName } from "./group";
import { normalizeGroup } from "./normalize";

/**
 * 앱 이전에 ChatGPT 가 쓰던 구조를 읽어 온다:
 *   /<CHANNEL>/draft/<Google Docs>            (최근 형식 — 문서가 바로 놓임)
 *   /<CHANNEL>/draft/<post-folder>/<Google Docs>  (이전 형식 — 폴더 안 "metadata — …" 문서)
 * 루트 바로 아래에 있고 계정 키·inbox·_system 이 아닌 폴더를 "레거시 채널 폴더" 로 본다.
 */
export interface LegacyFolder {
  id: string;
  name: string;
  /** draft/ 아래 가져올 수 있는 초안 수 (문서 + 문서를 가진 하위 폴더) */
  drafts: number;
}

const RESERVED = new Set(["inbox", "_system"]);

async function draftFolderOf(drive: DriveClient, channelFolderId: string): Promise<DriveFile | null> {
  const f = await drive.findChild(channelFolderId, "draft");
  return f && f.mimeType === FOLDER_MIME ? f : null;
}

interface LegacyDraft {
  /** 초안 문서 */
  doc: DriveFile;
  /** 문서를 담고 있던 폴더 (draft/ 자체이거나 그 아래 포스트 폴더) */
  parentId: string;
  /** 포스트 폴더에서 온 경우 그 폴더 이름 (post_id 로 쓴다) */
  folderName: string | null;
  /** 같은 폴더의 이미지들 */
  images: DriveFile[];
}

async function collectDrafts(drive: DriveClient, draftFolderId: string): Promise<LegacyDraft[]> {
  const out: LegacyDraft[] = [];
  const children = await drive.listChildren(draftFolderId);
  const looseImages = children.filter((c) => c.mimeType.startsWith("image/"));
  for (const c of children) {
    if (c.mimeType === GDOC_MIME || c.mimeType === "text/markdown" || /\.(md|markdown|txt)$/i.test(c.name)) {
      out.push({ doc: c, parentId: draftFolderId, folderName: null, images: looseImages });
    } else if (c.mimeType === FOLDER_MIME) {
      const inner = await drive.listChildren(c.id);
      // 앱이 만든 정식 포스트 폴더(metadata.json 파일)는 건너뛴다
      if (inner.some((f) => f.name === "metadata.json" && f.mimeType !== GDOC_MIME)) continue;
      const doc = inner.find((f) => f.mimeType === GDOC_MIME || /\.(md|markdown|txt)$/i.test(f.name));
      if (doc) out.push({ doc, parentId: c.id, folderName: c.name, images: inner.filter((f) => f.mimeType.startsWith("image/")) });
    }
  }
  return out;
}

/** 루트의 레거시 채널 폴더 목록 (가져올 초안이 있는 것만) */
export async function listLegacyFolders(drive: DriveClient): Promise<LegacyFolder[]> {
  const keys = new Set((await listAccounts(drive)).map((a) => a.key));
  const out: LegacyFolder[] = [];
  for (const f of await drive.listChildren(drive.rootFolderId())) {
    if (f.mimeType !== FOLDER_MIME || RESERVED.has(f.name) || keys.has(f.name)) continue;
    const draft = await draftFolderOf(drive, f.id);
    if (!draft) continue;
    const drafts = await collectDrafts(drive, draft.id);
    if (drafts.length) out.push({ id: f.id, name: f.name, drafts: drafts.length });
  }
  return out;
}

export interface LegacyImportResult {
  source: string;
  account_key: string;
  created: number;
  needs_repair: number;
  skipped: number;
  errors: number;
  entries: IngestLogEntry[];
}

/**
 * 레거시 채널 폴더의 초안을 계정(=채널)으로 가져온다. 원본 문서는 새 포스트 폴더의 _inbox_original/ 로 옮겨지므로
 * 다시 실행해도 같은 초안이 두 번 들어오지 않는다.
 */
export async function importLegacyFolder(drive: DriveClient, sourceFolderId: string, accountKey: string): Promise<LegacyImportResult> {
  const account = await getAccount(drive, accountKey);
  if (!account) throw new Error(`채널 없음: ${accountKey}`);
  const source = await drive.getFile(sourceFolderId);
  const draft = await draftFolderOf(drive, sourceFolderId);
  const now = new Date();
  const nowIso = now.toISOString();
  const entries: IngestLogEntry[] = [];
  let created = 0, needsRepair = 0, errors = 0;
  const skipped = 0;

  if (draft) {
    for (const d of await collectDrafts(drive, draft.id)) {
      // 그룹 하나 = 문서 + 같은 폴더의 이미지. 접두는 포스트 폴더 이름 > 문서 제목 순.
      const named = d.folderName ? parseDraftName(d.folderName) : parseDraftName(d.doc.name);
      const fromName = groupInboxFiles([{ id: d.doc.id, name: d.doc.name, mimeType: d.doc.mimeType }])[0];
      const group: InboxGroup = {
        prefix: named.date ? `${named.date}_${named.slug}` : fromName.prefix,
        date: named.date ?? fromName.date,
        slug: d.folderName ? named.slug : fromName.slug,
        markdownFileId: d.doc.id,
        imageFileIds: d.images.map((img, i) => ({ fileId: img.id, name: img.name, order: i + 1 })),
        otherFileIds: [],
      };
      try {
        // 채널 폴더가 레거시 폴더 그 자체일 수 있다(Drive 이름 검색은 대소문자 구분 없음: LIFE == life).
        // 그러면 새 포스트 폴더 이름이 레거시 포스트 폴더와 충돌해 "-2" 가 붙으므로, 레거시 폴더를 먼저 비켜 세운다.
        if (d.folderName) await drive.rename(d.parentId, `${d.folderName}.legacy`);
        const res = await normalizeGroup(drive, account, group, d.parentId, now);
        if (res.status === "draft") created++;
        else needsRepair++;
        entries.push({ at: nowIso, channel: account.key, prefix: group.prefix, source_fingerprint: `legacy:${d.doc.id}`, result: res.status === "draft" ? "created" : "needs_repair", post_id: res.postId, message: `from ${source.name}/draft${d.folderName ? `/${d.folderName}` : ""}${res.problems.length ? " | " + res.problems.join(" | ") : ""}` });
        // 비워진 레거시 포스트 폴더는 정리
        if (d.folderName && (await drive.listChildren(d.parentId)).length === 0) await drive.deleteFile(d.parentId).catch(() => undefined);
      } catch (e) {
        errors++;
        console.error("[legacy-import]", group.prefix, e);
        if (d.folderName) await drive.rename(d.parentId, d.folderName).catch(() => undefined);
        entries.push({ at: nowIso, channel: account.key, prefix: group.prefix, source_fingerprint: `legacy:${d.doc.id}`, result: "error", post_id: null, message: String(e) });
      }
    }
  }

  const log = await readIngestLog(drive);
  await writeIngestLog(drive, { last_sync_at: log.data.last_sync_at, entries: [...entries, ...log.data.entries].slice(0, INGEST_LOG_MAX) });
  await rebuildIndex(drive);
  return { source: source.name, account_key: account.key, created, needs_repair: needsRepair, skipped, errors, entries };
}
