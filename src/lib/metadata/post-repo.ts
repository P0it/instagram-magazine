import "server-only";
import {
  EditorStateSchema,
  PostMetadataSchema,
  SourcesFileSchema,
  VisualBriefSchema,
  type DriveFileRef,
  type EditorState,
  type PostBundle,
  type PostMetadata,
  type PostStatus,
  type SourcesFile,
  type VisualBrief,
} from "@/types";
import { isImageMime, type DriveClient, type DriveFile } from "@/lib/drive/types";
import { locatePostFolder, statusFolderId, type LocatedPostFolder } from "@/lib/drive/paths";
import { folderForStatus, statusForFolder } from "./transitions";
import { readImageDims, type ImageDims } from "./image-dims";

export class PostNotFoundError extends Error {
  constructor(postId: string) {
    super(`Post not found: ${postId}`);
    this.name = "PostNotFoundError";
  }
}
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}
export class InvalidTransitionError extends Error {
  constructor(from: PostStatus, to: PostStatus) {
    super(`Invalid transition ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export interface LoadedPost extends PostBundle {
  located: LocatedPostFolder;
  files: {
    metadata: DriveFile | null;
    sources: DriveFile | null;
    visualBrief: DriveFile | null;
    editorState: DriveFile | null;
    assetsFolder: DriveFile | null;
    rendersFolder: DriveFile | null;
  };
}

function toRef(f: DriveFile): DriveFileRef {
  return { fileId: f.id, name: f.name, mimeType: f.mimeType, size: f.size, md5: f.md5Checksum };
}

async function readJsonOr<T>(drive: DriveClient, f: DriveFile | null, parse: (raw: unknown) => T, fallback: () => T): Promise<T> {
  if (!f) return fallback();
  try {
    return parse(JSON.parse(await drive.readText(f.id)));
  } catch (e) {
    console.warn(`[post-repo] ${f.name} invalid:`, e);
    return fallback();
  }
}

export async function loadPostFromFolder(drive: DriveClient, located: LocatedPostFolder): Promise<LoadedPost> {
  const children = await drive.listChildren(located.folder.id);
  const byName = new Map(children.map((c) => [c.name, c]));
  const metadataFile = byName.get("metadata.json") ?? null;
  const sourcesFile = byName.get("sources.json") ?? null;
  const briefFile = byName.get("visual-brief.json") ?? null;
  const editorFile = byName.get("editor-state.json") ?? null;
  const assetsFolder = byName.get("assets") ?? null;
  const rendersFolder = byName.get("renders") ?? null;

  const now = new Date().toISOString();
  const metadata = await readJsonOr(
    drive,
    metadataFile,
    (raw) => PostMetadataSchema.parse(raw),
    () =>
      PostMetadataSchema.parse({
        post_id: located.folder.name,
        channel: located.channel,
        status: "needs_repair",
        headline: located.folder.name,
        warnings: [metadataFile ? "invalid_metadata" : "missing_metadata"],
        created_at: located.folder.modifiedTime || now,
        updated_at: located.folder.modifiedTime || now,
      }),
  );
  const sources = await readJsonOr(drive, sourcesFile, (raw) => SourcesFileSchema.parse(raw), () => SourcesFileSchema.parse({}));
  const visualBrief = await readJsonOr(drive, briefFile, (raw) => VisualBriefSchema.parse(raw), () => VisualBriefSchema.parse({}));
  const editorState = await readJsonOr(drive, editorFile, (raw) => EditorStateSchema.parse(raw), () => EditorStateSchema.parse({}));

  const assets = assetsFolder ? (await drive.listChildren(assetsFolder.id)).filter((f) => isImageMime(f.mimeType)).map(toRef) : [];
  const renders = rendersFolder
    ? (await drive.listChildren(rendersFolder.id))
        .filter((f) => isImageMime(f.mimeType))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(toRef)
    : [];

  return {
    metadata,
    sources,
    visualBrief,
    editorState,
    folderId: located.folder.id,
    folderStatus: statusForFolder(located.folderStatus),
    assets,
    renders,
    located,
    files: {
      metadata: metadataFile,
      sources: sourcesFile,
      visualBrief: briefFile,
      editorState: editorFile,
      assetsFolder,
      rendersFolder,
    },
  };
}

export async function loadPost(drive: DriveClient, postId: string): Promise<LoadedPost> {
  const located = await locatePostFolder(drive, postId);
  if (!located) throw new PostNotFoundError(postId);
  return loadPostFromFolder(drive, located);
}

export async function writeMetadata(drive: DriveClient, folderId: string, metadata: PostMetadata): Promise<PostMetadata> {
  const validated = PostMetadataSchema.parse(metadata);
  await drive.writeText(folderId, "metadata.json", JSON.stringify(validated, null, 2), "application/json");
  return validated;
}

export async function writeEditorState(drive: DriveClient, folderId: string, state: EditorState): Promise<void> {
  const validated = EditorStateSchema.parse(state);
  await drive.writeText(folderId, "editor-state.json", JSON.stringify(validated, null, 2), "application/json");
}

export async function writeSources(drive: DriveClient, folderId: string, sources: SourcesFile): Promise<void> {
  const validated = SourcesFileSchema.parse(sources);
  await drive.writeText(folderId, "sources.json", JSON.stringify(validated, null, 2), "application/json");
}

export async function writeVisualBrief(drive: DriveClient, folderId: string, brief: VisualBrief): Promise<void> {
  const validated = VisualBriefSchema.parse(brief);
  await drive.writeText(folderId, "visual-brief.json", JSON.stringify(validated, null, 2), "application/json");
}

/** 낙관적 락: expected_updated_at 이 현재와 다르면 409 */
export function assertNotStale(current: PostMetadata, expectedUpdatedAt: string): void {
  if (current.updated_at !== expectedUpdatedAt) {
    throw new ConflictError(`Post was modified (server ${current.updated_at}, client ${expectedUpdatedAt})`);
  }
}

/** 상태에 맞는 폴더로 포스트 폴더를 옮긴다. 이미 맞는 곳이면 no-op. */
export async function movePostFolderForStatus(drive: DriveClient, post: LoadedPost, status: PostStatus): Promise<LocatedPostFolder> {
  const target = folderForStatus(status);
  if (post.located.folderStatus === target) return post.located;
  const from = await statusFolderId(drive, post.located.channel, post.located.folderStatus);
  const to = await statusFolderId(drive, post.located.channel, target);
  const moved = await drive.moveFile(post.located.folder.id, from, to);
  return { channel: post.located.channel, folderStatus: target, folder: moved };
}

export async function ensureSubfolder(drive: DriveClient, post: LoadedPost, name: "assets" | "renders" | "_inbox_original"): Promise<DriveFile> {
  const existing = name === "assets" ? post.files.assetsFolder : name === "renders" ? post.files.rendersFolder : null;
  if (existing) return existing;
  const found = await drive.findChild(post.folderId, name);
  return found ?? drive.createFolder(post.folderId, name);
}

/** renders 폴더 이미지들의 크기 (승인 게이트용). 파일당 헤더 64KB 만 읽으면 충분하지만 Drive API 는 전체를 주므로 그대로. */
export async function readRenderDims(drive: DriveClient, renders: DriveFileRef[]): Promise<(ImageDims | null)[]> {
  const out: (ImageDims | null)[] = [];
  for (const r of renders) {
    try {
      out.push(readImageDims(await drive.readBytes(r.fileId)));
    } catch {
      out.push(null);
    }
  }
  return out;
}

export function renderFileName(index: number, ext = "jpg"): string {
  return `slide_${String(index + 1).padStart(2, "0")}.${ext}`;
}

export function toBundle(post: LoadedPost): PostBundle {
  const { metadata, sources, visualBrief, editorState, folderId, folderStatus, assets, renders } = post;
  return { metadata, sources, visualBrief, editorState, folderId, folderStatus, assets, renders };
}
