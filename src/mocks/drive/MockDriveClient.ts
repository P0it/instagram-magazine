import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import {
  DriveNotFoundError,
  FOLDER_MIME,
  guessMime,
  type DriveClient,
  type DriveFile,
} from "@/lib/drive/types";

interface MockNode {
  file: DriveFile;
  content: Uint8Array | null;
}

export interface MockTree {
  nodes: Map<string, MockNode>;
  rootId: string;
}

/**
 * 인메모리 Drive. dev 서버 HMR 간 유지되도록 globalThis에 트리를 둔다.
 * 시드는 src/mocks/seed.ts 가 담당.
 */
export class MockDriveClient implements DriveClient {
  readonly kind = "mock" as const;
  private nodes: Map<string, MockNode>;
  private rootId: string;

  constructor(tree: MockTree) {
    this.nodes = tree.nodes;
    this.rootId = tree.rootId;
  }

  static createEmpty(rootName = "Instagram Magazine"): MockTree {
    const rootId = "root_" + randomUUID().slice(0, 8);
    const nodes = new Map<string, MockNode>();
    nodes.set(rootId, {
      file: {
        id: rootId,
        name: rootName,
        mimeType: FOLDER_MIME,
        parents: [],
        size: null,
        md5Checksum: null,
        version: "1",
        modifiedTime: new Date().toISOString(),
      },
      content: null,
    });
    return { nodes, rootId };
  }

  rootFolderId(): string {
    return this.rootId;
  }

  private node(id: string): MockNode {
    const n = this.nodes.get(id);
    if (!n) throw new DriveNotFoundError(`Mock file not found: ${id}`);
    return n;
  }

  async getFile(fileId: string): Promise<DriveFile> {
    return { ...this.node(fileId).file };
  }

  async listChildren(folderId: string): Promise<DriveFile[]> {
    this.node(folderId);
    const out: DriveFile[] = [];
    for (const n of this.nodes.values()) {
      if (n.file.parents.includes(folderId)) out.push({ ...n.file });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  async findChild(folderId: string, name: string): Promise<DriveFile | null> {
    for (const n of this.nodes.values()) {
      if (n.file.parents.includes(folderId) && n.file.name === name) return { ...n.file };
    }
    return null;
  }

  async readText(fileId: string): Promise<string> {
    return new TextDecoder().decode(await this.readBytes(fileId));
  }

  async readBytes(fileId: string): Promise<Uint8Array> {
    const n = this.node(fileId);
    if (!n.content) throw new DriveNotFoundError(`Mock file has no content: ${fileId}`);
    return n.content;
  }

  private putFile(folderId: string, name: string, bytes: Uint8Array, mimeType: string): DriveFile {
    this.node(folderId);
    const md5 = createHash("md5").update(bytes).digest("hex");
    const now = new Date().toISOString();
    let existing: MockNode | undefined;
    for (const n of this.nodes.values()) {
      if (n.file.parents.includes(folderId) && n.file.name === name && n.file.mimeType !== FOLDER_MIME) {
        existing = n;
        break;
      }
    }
    if (existing) {
      existing.content = bytes;
      existing.file = {
        ...existing.file,
        size: bytes.byteLength,
        md5Checksum: md5,
        mimeType,
        version: String(Number(existing.file.version ?? "0") + 1),
        modifiedTime: now,
      };
      return { ...existing.file };
    }
    const id = "f_" + randomUUID().replace(/-/g, "").slice(0, 16);
    const file: DriveFile = {
      id,
      name,
      mimeType,
      parents: [folderId],
      size: bytes.byteLength,
      md5Checksum: md5,
      version: "1",
      modifiedTime: now,
    };
    this.nodes.set(id, { file, content: bytes });
    return { ...file };
  }

  async writeText(folderId: string, name: string, text: string, mimeType?: string): Promise<DriveFile> {
    return this.putFile(folderId, name, new TextEncoder().encode(text), mimeType ?? guessMime(name));
  }

  async uploadBytes(folderId: string, name: string, bytes: Uint8Array, mimeType: string): Promise<DriveFile> {
    return this.putFile(folderId, name, bytes, mimeType);
  }

  async createFolder(parentId: string, name: string): Promise<DriveFile> {
    this.node(parentId);
    const id = "d_" + randomUUID().replace(/-/g, "").slice(0, 16);
    const file: DriveFile = {
      id,
      name,
      mimeType: FOLDER_MIME,
      parents: [parentId],
      size: null,
      md5Checksum: null,
      version: "1",
      modifiedTime: new Date().toISOString(),
    };
    this.nodes.set(id, { file, content: null });
    return { ...file };
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
    const n = this.node(fileId);
    this.node(toParentId);
    n.file = {
      ...n.file,
      parents: [...n.file.parents.filter((p) => p !== fromParentId), toParentId],
      modifiedTime: new Date().toISOString(),
    };
    return { ...n.file };
  }

  async rename(fileId: string, name: string): Promise<DriveFile> {
    const n = this.node(fileId);
    n.file = { ...n.file, name, modifiedTime: new Date().toISOString() };
    return { ...n.file };
  }

  async deleteFile(fileId: string): Promise<void> {
    const n = this.node(fileId);
    if (n.file.mimeType === FOLDER_MIME) {
      const children = await this.listChildren(fileId);
      for (const c of children) await this.deleteFile(c.id);
    }
    this.nodes.delete(fileId);
  }

  async isDescendantOf(fileId: string, rootId: string): Promise<boolean> {
    let cur = this.nodes.get(fileId);
    let guard = 0;
    while (cur && guard++ < 64) {
      if (cur.file.id === rootId) return true;
      const parent = cur.file.parents[0];
      if (!parent) return false;
      cur = this.nodes.get(parent);
    }
    return false;
  }

  /** 테스트/디버그용 스냅샷 */
  snapshot(): { id: string; name: string; parents: string[]; mimeType: string }[] {
    return [...this.nodes.values()].map((n) => ({
      id: n.file.id,
      name: n.file.name,
      parents: n.file.parents,
      mimeType: n.file.mimeType,
    }));
  }
}
