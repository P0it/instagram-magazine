import "server-only";
import { CHANNEL_KEYS, type ChannelKey } from "@/types";
import type { DriveClient, DriveFile } from "./types";
import type { FolderStatus } from "@/lib/metadata/transitions";

/**
 * 루트 하위 고정 폴더 ID 해석 + 프로세스 캐시.
 * Drive 는 이름 조회가 느리므로 (root, name) → id 를 기억한다.
 */
const folderCache = new Map<string, string>();

function key(drive: DriveClient, ...parts: string[]): string {
  return `${drive.kind}:${drive.rootFolderId()}:${parts.join("/")}`;
}

async function ensureCached(drive: DriveClient, path: string[]): Promise<string> {
  const k = key(drive, ...path);
  const hit = folderCache.get(k);
  if (hit) {
    try {
      await drive.getFile(hit);
      return hit;
    } catch {
      folderCache.delete(k);
    }
  }
  const f = await drive.ensureFolder(drive.rootFolderId(), path);
  folderCache.set(k, f.id);
  return f.id;
}

export const systemFolderId = (drive: DriveClient) => ensureCached(drive, ["_system"]);
export const stylePacksFolderId = (drive: DriveClient) => ensureCached(drive, ["_system", "style-packs"]);
export const inboxFolderId = (drive: DriveClient, ch: ChannelKey) => ensureCached(drive, ["inbox", ch]);
export const channelFolderId = (drive: DriveClient, ch: ChannelKey) => ensureCached(drive, [ch]);
export const statusFolderId = (drive: DriveClient, ch: ChannelKey, status: FolderStatus) =>
  ensureCached(drive, [ch, status]);

export const FOLDER_STATUSES: readonly FolderStatus[] = ["draft", "approved", "published"];

export interface LocatedPostFolder {
  channel: ChannelKey;
  folderStatus: FolderStatus;
  folder: DriveFile;
}

/** 모든 채널/상태 폴더를 순회해 포스트 폴더 목록 */
export async function listAllPostFolders(drive: DriveClient): Promise<LocatedPostFolder[]> {
  const out: LocatedPostFolder[] = [];
  for (const ch of CHANNEL_KEYS) {
    for (const st of FOLDER_STATUSES) {
      const id = await statusFolderId(drive, ch, st);
      const children = await drive.listChildren(id);
      for (const c of children) {
        if (c.mimeType === "application/vnd.google-apps.folder") out.push({ channel: ch, folderStatus: st, folder: c });
      }
    }
  }
  return out;
}

/** post_id(=폴더명) 로 포스트 폴더 찾기 */
export async function locatePostFolder(drive: DriveClient, postId: string): Promise<LocatedPostFolder | null> {
  for (const ch of CHANNEL_KEYS) {
    for (const st of FOLDER_STATUSES) {
      const id = await statusFolderId(drive, ch, st);
      const f = await drive.findChild(id, postId);
      if (f && f.mimeType === "application/vnd.google-apps.folder") return { channel: ch, folderStatus: st, folder: f };
    }
  }
  return null;
}

export function invalidateFolderCache(): void {
  folderCache.clear();
}
