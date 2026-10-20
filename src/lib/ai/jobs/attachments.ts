import "server-only";
import type { DriveClient } from "@/lib/drive/types";
import type { GeneratedAttachment } from "@/lib/ai/generate/save";

/** 첨부 사진 제한 — 모달·API 가 같은 값을 쓴다 */
export const MAX_ATTACHMENTS = 6;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_MIMES = ["image/png", "image/jpeg", "image/webp"] as const;
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

const tmpRoot = (drive: DriveClient) => drive.ensureFolder(drive.rootFolderId(), ["_system", "ai-tmp"]);

/** 작업마다 `_system/ai-tmp/<jobId>/` 에 둔다. 작업이 끝나면 runner 가 지운다. */
export async function saveAttachments(drive: DriveClient, jobId: string, files: File[]): Promise<void> {
  if (files.length === 0) return;
  const root = await tmpRoot(drive);
  const folder = await drive.createFolder(root.id, jobId);
  for (const [i, file] of files.entries()) {
    await drive.uploadBytes(folder.id, `${i}.${EXT[file.type] ?? "png"}`, new Uint8Array(await file.arrayBuffer()), file.type);
  }
}

export async function loadAttachments(drive: DriveClient, jobId: string): Promise<GeneratedAttachment[]> {
  const folder = await drive.findChild((await tmpRoot(drive)).id, jobId);
  if (!folder) return [];
  const files = (await drive.listChildren(folder.id)).sort((a, b) => Number.parseInt(a.name) - Number.parseInt(b.name));
  return Promise.all(files.map(async (f) => ({ name: f.name, mime: f.mimeType, bytes: await drive.readBytes(f.id) })));
}

export async function removeAttachments(drive: DriveClient, jobId: string): Promise<void> {
  try {
    const folder = await drive.findChild((await tmpRoot(drive)).id, jobId);
    if (folder) await drive.deleteFile(folder.id);
  } catch (e) {
    console.warn(`[ai-jobs] temp attachments of ${jobId} not removed:`, e);
  }
}
