export const FOLDER_MIME = "application/vnd.google-apps.folder";
/** Google Docs 문서 — 바이너리가 아니라 export 로만 읽을 수 있다 */
export const GDOC_MIME = "application/vnd.google-apps.document";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  size: number | null;
  md5Checksum: string | null;
  version: string | null;
  modifiedTime: string;
}

export interface WriteResult {
  file: DriveFile;
}

/**
 * Drive 접근 추상화. Mock / Google 두 구현.
 * 모든 경로는 "폴더 ID"로만 표현한다. 이름 기반 탐색은 findChild/ensureFolder.
 */
export interface DriveClient {
  readonly kind: "mock" | "google";
  rootFolderId(): string;

  getFile(fileId: string): Promise<DriveFile>;
  listChildren(folderId: string): Promise<DriveFile[]>;
  findChild(folderId: string, name: string): Promise<DriveFile | null>;

  /** 텍스트 읽기. Google Docs 문서는 text/plain 으로 export 한다. */
  readText(fileId: string): Promise<string>;
  readBytes(fileId: string): Promise<Uint8Array>;

  /** JSON 파일 쓰기(없으면 생성, 있으면 교체). 임시 업로드 → rename 으로 원자성. */
  writeText(folderId: string, name: string, text: string, mimeType?: string): Promise<DriveFile>;
  uploadBytes(folderId: string, name: string, bytes: Uint8Array, mimeType: string): Promise<DriveFile>;

  createFolder(parentId: string, name: string): Promise<DriveFile>;
  /** 경로의 각 세그먼트를 순서대로 찾거나 만들어 마지막 폴더를 반환 */
  ensureFolder(parentId: string, path: string[]): Promise<DriveFile>;

  moveFile(fileId: string, fromParentId: string, toParentId: string): Promise<DriveFile>;
  rename(fileId: string, name: string): Promise<DriveFile>;
  deleteFile(fileId: string): Promise<void>;

  /** fileId 가 rootId 하위인지 (부모 체인 검사). 이미지 프록시 보호용. */
  isDescendantOf(fileId: string, rootId: string): Promise<boolean>;
}

export class DriveNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DriveNotFoundError";
  }
}

export function isFolder(f: DriveFile): boolean {
  return f.mimeType === FOLDER_MIME;
}

export function guessMime(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "json":
      return "application/json";
    case "md":
      return "text/markdown";
    case "txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}
