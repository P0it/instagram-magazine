import "server-only";
import { google, type drive_v3 } from "googleapis";
import { Readable } from "node:stream";
import {
  DriveNotFoundError,
  FOLDER_MIME,
  GDOC_MIME,
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

/**
 * Drive API 의 일시적 오류(5xx · 429 · rate limit · "error preparing the response")는 몇 번 다시 시도한다.
 * 쓰기 호출은 클로저 안에서 요청 본문을 새로 만들어야 스트림이 재사용된다.
 */
function isTransient(err: unknown): boolean {
  const e = err as { code?: number | string; message?: string; errors?: { reason?: string }[] };
  const code = Number(e?.code);
  if (code >= 500 || code === 429) return true;
  const reasons = (e?.errors ?? []).map((x) => x.reason ?? "");
  if (reasons.some((r) => /rateLimitExceeded|userRateLimitExceeded|backendError|internalError/.test(r))) return true;
  return /error preparing the response|ECONNRESET|ETIMEDOUT|socket hang up/i.test(String(e?.message ?? ""));
}

export async function withRetry<T>(fn: () => Promise<T>, attempts = 4, baseMs = 500): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!isTransient(err) || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i + Math.random() * 200));
    }
  }
  throw last;
}

function escapeQuery(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export const DEFAULT_ROOT_FOLDER_NAME = "Instagram Magazine";

export type GoogleAuth = InstanceType<typeof google.auth.JWT> | InstanceType<typeof google.auth.OAuth2>;

export function serviceAccountAuth(serviceAccountJsonBase64: string): GoogleAuth {
  if (!serviceAccountJsonBase64) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON missing");
  const credentials = JSON.parse(Buffer.from(serviceAccountJsonBase64, "base64").toString("utf8")) as {
    client_email: string;
    private_key: string;
  };
  return new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
}

/** 사용자 본인 Drive: refresh token 으로 access token 을 자동 갱신하는 OAuth2 클라이언트 */
export function oauthAuth(opts: { clientId: string; clientSecret: string; refreshToken: string }): GoogleAuth {
  const auth = new google.auth.OAuth2({ clientId: opts.clientId, clientSecret: opts.clientSecret });
  auth.setCredentials({ refresh_token: opts.refreshToken });
  return auth;
}

/**
 * 루트 폴더 결정. rootFolderId 가 있으면 그대로, 없으면 내 드라이브 최상위에서
 * "Instagram Magazine" 폴더를 찾고 없으면 만든다 (OAuth 모드 전용 — 서비스 계정은 공유된 폴더 id 가 필요).
 */
export async function resolveRootFolder(auth: GoogleAuth, rootFolderId: string): Promise<string> {
  if (rootFolderId) return rootFolderId;
  const drive = google.drive({ version: "v3", auth });
  const q = `'root' in parents and name = '${escapeQuery(DEFAULT_ROOT_FOLDER_NAME)}' and mimeType = '${FOLDER_MIME}' and trashed = false`;
  const found = await drive.files.list({ q, fields: "files(id)", pageSize: 1 });
  const hit = found.data.files?.[0]?.id;
  if (hit) return hit;
  const created = await drive.files.create({
    requestBody: { name: DEFAULT_ROOT_FOLDER_NAME, mimeType: FOLDER_MIME, parents: ["root"] },
    fields: "id",
  });
  if (!created.data.id) throw new Error("루트 폴더를 만들지 못했습니다");
  return created.data.id;
}

export interface GoogleDriveIdentity {
  email: string | null;
  displayName: string | null;
}

/** 연결된 Google 계정 (설정 화면 표시용) */
export async function fetchDriveIdentity(auth: GoogleAuth): Promise<GoogleDriveIdentity> {
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.about.get({ fields: "user(emailAddress,displayName)" });
  return { email: res.data.user?.emailAddress ?? null, displayName: res.data.user?.displayName ?? null };
}

export class GoogleDriveClient implements DriveClient {
  readonly kind = "google" as const;
  private drive: drive_v3.Drive;
  private root: string;
  private ancestryCache = new Map<string, boolean>();

  constructor(auth: GoogleAuth, rootFolderId: string) {
    if (!rootFolderId) throw new Error("root folder id missing");
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
    const meta = await this.getFile(fileId);
    if (meta.mimeType === GDOC_MIME) {
      const res = await this.drive.files.export({ fileId, mimeType: "text/plain" }, { responseType: "text" });
      // Docs export 는 BOM 으로 시작한다
      return String(res.data).replace(/^\uFEFF/, "");
    }
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
    const create = (fileName: string) =>
      withRetry(() =>
        this.drive.files.create({
          requestBody: { name: fileName, parents: [folderId], mimeType },
          media: { mimeType, body: Readable.from(Buffer.from(bytes)) },
          fields: FIELDS,
          supportsAllDrives: true,
        }),
      );
    if (existing) {
      // 임시 이름으로 새 파일 업로드 → 기존 삭제 → 이름 교체 (원자성 근사)
      const created = await create(`.${name}.tmp-${Date.now()}`);
      // 동시 쓰기로 이미 지워졌으면(404) 그대로 진행한다
      await withRetry(() => this.drive.files.delete({ fileId: existing.id, supportsAllDrives: true })).catch((e: unknown) => {
        if ((e as { code?: number }).code !== 404) throw e;
      });
      const renamed = await withRetry(() =>
        this.drive.files.update({ fileId: created.data.id ?? "", requestBody: { name }, fields: FIELDS, supportsAllDrives: true }),
      );
      return toDriveFile(renamed.data);
    }
    const created = await create(name);
    return toDriveFile(created.data);
  }

  async writeText(folderId: string, name: string, text: string, mimeType?: string): Promise<DriveFile> {
    return this.upload(folderId, name, new TextEncoder().encode(text), mimeType ?? guessMime(name));
  }

  async uploadBytes(folderId: string, name: string, bytes: Uint8Array, mimeType: string): Promise<DriveFile> {
    return this.upload(folderId, name, bytes, mimeType);
  }

  async createFolder(parentId: string, name: string): Promise<DriveFile> {
    const res = await withRetry(() =>
      this.drive.files.create({
        requestBody: { name, parents: [parentId], mimeType: FOLDER_MIME },
        fields: FIELDS,
        supportsAllDrives: true,
      }),
    );
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
    const res = await withRetry(() =>
      this.drive.files.update({
        fileId,
        addParents: toParentId,
        removeParents: fromParentId,
        fields: FIELDS,
        supportsAllDrives: true,
      }),
    );
    this.ancestryCache.delete(fileId);
    return toDriveFile(res.data);
  }

  async rename(fileId: string, name: string): Promise<DriveFile> {
    const res = await withRetry(() =>
      this.drive.files.update({
        fileId,
        requestBody: { name },
        fields: FIELDS,
        supportsAllDrives: true,
      }),
    );
    return toDriveFile(res.data);
  }

  async deleteFile(fileId: string): Promise<void> {
    await withRetry(() => this.drive.files.delete({ fileId, supportsAllDrives: true }));
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
