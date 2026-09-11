import "server-only";
import { google, type drive_v3 } from "googleapis";
import { Readable } from "node:stream";
import {
  DriveNotFoundError,
  FOLDER_MIME,
  guessMime,
  type DriveClient,
  type DriveFile,
} from "./types";

const FIELDS = "id,name,mimeType,parents,size,md5Checksum,version,modifiedTime";

function toDriveFile(f: drive_v3.Schema$File): DriveFile {
  return {
    id: f.id ?? "",
    name: f.name ?? "",
    mimeType: f.mimeType ?? "application/octet-stream",
    parents: f.parents ?? [],
    size: f.size ? Number(f.size) : null,
    md5Checksum: f.md5Checksum ?? null,
    version: f.version ?? null,
    modifiedTime: f.modifiedTime ?? new Date(0).toISOString(),
  };
}

function escapeQuery(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export class GoogleDriveClient implements DriveClient {
  readonly kind = "google" as const;
  private drive: drive_v3.Drive;
  private root: string;
  private ancestryCache = new Map<string, boolean>();

  constructor(serviceAccountJsonBase64: string, rootFolderId: string) {
    if (!serviceAccountJsonBase64) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON missing");
    if (!rootFolderId) throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID missing");
    const credentials = JSON.parse(Buffer.from(serviceAccountJsonBase64, "base64").toString("utf8")) as {
      client_email: string;
      private_key: string;
    };
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    this.drive = google.drive({ version: "v3", auth });
    this.root = rootFolderId;
  }

  rootFolderId(): string {
    return this.root;
  }

  async getFile(fileId: string): Promise<DriveFile> {
    try {
      const res = await this.drive.files.get({ fileId, fields: FIELDS, supportsAllDrives: true });
      return toDriveFile(res.data);
    } catch (e) {
      throw new DriveNotFoundError(`Drive file not found: ${fileId} (${String(e)})`);
    }
  }

  async listChildren(folderId: string): Promise<DriveFile[]> {
    const out: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const res = await this.drive.files.list({
        q: `'${escapeQuery(folderId)}' in parents and trashed = false`,
        fields: `nextPageToken, files(${FIELDS})`,
        pageSize: 1000,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      for (const f of res.data.files ?? []) out.push(toDriveFile(f));
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  async findChild(folderId: string, name: string): Promise<DriveFile | null> {
    const res = await this.drive.files.list({
      q: `'${escapeQuery(folderId)}' in parents and name = '${escapeQuery(name)}' and trashed = false`,
      fields: `files(${FIELDS})`,
      pageSize: 2,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const f = res.data.files?.[0];
    return f ? toDriveFile(f) : null;
  }

  async readText(fileId: string): Promise<string> {
    return Buffer.from(await this.readBytes(fileId)).toString("utf8");
  }

  async readBytes(fileId: string): Promise<Uint8Array> {
    const res = await this.drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" },
    );
    return new Uint8Array(res.data as ArrayBuffer);
  }

  private async upload(folderId: string, name: string, bytes: Uint8Array, mimeType: string): Promise<DriveFile> {
    const existing = await this.findChild(folderId, name);
    const body = Readable.from(Buffer.from(bytes));
    if (existing) {
      // 임시 이름으로 새 파일 업로드 → 기존 삭제 → 이름 교체 (원자성 근사)
      const tmpName = `.${name}.tmp-${Date.now()}`;
      const created = await this.drive.files.create({
        requestBody: { name: tmpName, parents: [folderId], mimeType },
        media: { mimeType, body },
        fields: FIELDS,
        supportsAllDrives: true,
      });
      await this.drive.files.delete({ fileId: existing.id, supportsAllDrives: true });
      const renamed = await this.drive.files.update({
        fileId: created.data.id ?? "",
        requestBody: { name },
        fields: FIELDS,
        supportsAllDrives: true,
      });
      return toDriveFile(renamed.data);
    }
    const created = await this.drive.files.create({
      requestBody: { name, parents: [folderId], mimeType },
      media: { mimeType, body },
      fields: FIELDS,
      supportsAllDrives: true,
    });
    return toDriveFile(created.data);
  }

  async writeText(folderId: string, name: string, text: string, mimeType?: string): Promise<DriveFile> {
    return this.upload(folderId, name, new TextEncoder().encode(text), mimeType ?? guessMime(name));
  }

  async uploadBytes(folderId: string, name: string, bytes: Uint8Array, mimeType: string): Promise<DriveFile> {
    return this.upload(folderId, name, bytes, mimeType);
  }

  async createFolder(parentId: string, name: string): Promise<DriveFile> {
    const res = await this.drive.files.create({
      requestBody: { name, parents: [parentId], mimeType: FOLDER_MIME },
      fields: FIELDS,
      supportsAllDrives: true,
    });
    return toDriveFile(res.data);
  }

  async ensureFolder(parentId: string, path: string[]): Promise<DriveFile> {
    let current = await this.getFile(parentId);
    for (const seg of path) {
      const found = await this.findChild(current.id, seg);
      current = found && found.mimeType === FOLDER_MIME ? found : await this.createFolder(current.id, seg);
    }
    return current;
  }

  async moveFile(fileId: string, fromParentId: string, toParentId: string): Promise<DriveFile> {
    const res = await this.drive.files.update({
      fileId,
      addParents: toParentId,
      removeParents: fromParentId,
      fields: FIELDS,
      supportsAllDrives: true,
    });
    this.ancestryCache.delete(fileId);
    return toDriveFile(res.data);
  }

  async rename(fileId: string, name: string): Promise<DriveFile> {
    const res = await this.drive.files.update({
      fileId,
      requestBody: { name },
      fields: FIELDS,
      supportsAllDrives: true,
    });
    return toDriveFile(res.data);
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.drive.files.delete({ fileId, supportsAllDrives: true });
    this.ancestryCache.delete(fileId);
  }

  async isDescendantOf(fileId: string, rootId: string): Promise<boolean> {
    const cacheKey = `${fileId}:${rootId}`;
    const hit = this.ancestryCache.get(cacheKey);
    if (hit !== undefined) return hit;
    let currentId: string | undefined = fileId;
    let guard = 0;
    let result = false;
    while (currentId && guard++ < 32) {
      if (currentId === rootId) {
        result = true;
        break;
      }
      const f: DriveFile = await this.getFile(currentId);
      currentId = f.parents[0];
    }
    this.ancestryCache.set(cacheKey, result);
    return result;
  }
}
