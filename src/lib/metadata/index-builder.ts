import "server-only";
import { revalidateTag } from "next/cache";
import { IndexFileSchema, type IndexEntry, type IndexFile, type IndexWarning } from "@/types";
import type { DriveClient } from "@/lib/drive/types";
import { listAllPostFolders } from "@/lib/drive/paths";
import { readIndexFile, writeIndexFile } from "@/lib/drive/system-files";
import { loadPostFromFolder, type LoadedPost } from "./post-repo";
import { folderForStatus, isStaleLock } from "./transitions";

export const INDEX_CACHE_TAG = "post-index";

export function buildIndexEntry(post: LoadedPost): IndexEntry {
  const m = post.metadata;
  const warnings = new Set<IndexWarning>();
  for (const w of m.warnings) {
    if (w === "missing_metadata" || w === "invalid_metadata") warnings.add(w);
  }
  if (folderForStatus(m.status) !== post.located.folderStatus) warnings.add("status_mismatch");
  if (m.slides.length > 0 && post.renders.length === 0) warnings.add("missing_render");
  else if (post.renders.length !== m.slides.length) warnings.add("render_count_mismatch");
  if (m.status === "publishing" && isStaleLock(m.publish?.locked_at)) warnings.add("stale_lock");

  const coverSlide = m.slides[0];
  const coverRender = post.renders[0];
  const coverAsset = coverSlide?.asset ? post.assets.find((a) => a.name === coverSlide.asset) : undefined;

  return {
    post_id: m.post_id,
    channel: m.channel,
    status: m.status,
    folder_status: post.folderStatus,
    drive_folder_id: post.folderId,
    headline: m.headline,
    topic: m.topic,
    content_type: m.content_type,
    slide_count: m.slides.length,
    render_count: post.renders.length,
    cover_thumb_file_id: coverRender?.fileId ?? coverAsset?.fileId ?? null,
    fact_check_status: post.sources.fact_check_status,
    fact_check_required: m.fact_check_required,
    scheduled_at: m.publish?.run_at ?? m.scheduled_at ?? null,
    published_at: m.publish?.published_at ?? null,
    last_error: m.publish?.last_error ?? null,
    created_at: m.created_at,
    updated_at: m.updated_at,
    warnings: [...warnings],
  };
}

/** 전체 스캔 → index.json 재생성. 캐시 태그 무효화. */
export async function rebuildIndex(drive: DriveClient): Promise<IndexFile> {
  const folders = await listAllPostFolders(drive);
  const posts: IndexEntry[] = [];
  for (const located of folders) {
    try {
      const post = await loadPostFromFolder(drive, located);
      posts.push(buildIndexEntry(post));
    } catch (e) {
      console.warn(`[index] failed to load ${located.folder.name}:`, e);
    }
  }
  posts.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const file = IndexFileSchema.parse({ generated_at: new Date().toISOString(), posts });
  await writeIndexFile(drive, file);
  invalidateIndexCache();
  return file;
}

/** 단일 포스트만 갱신 (저장/전이 뒤). 전체 스캔 없이 index.json upsert. */
export async function upsertIndexEntry(drive: DriveClient, post: LoadedPost): Promise<void> {
  const { data } = await readIndexFile(drive);
  const entry = buildIndexEntry(post);
  const posts = data.posts.filter((p) => p.post_id !== entry.post_id);
  posts.push(entry);
  posts.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  await writeIndexFile(drive, { generated_at: new Date().toISOString(), posts });
  invalidateIndexCache();
}

export async function removeIndexEntry(drive: DriveClient, postId: string): Promise<void> {
  const { data } = await readIndexFile(drive);
  await writeIndexFile(drive, { generated_at: new Date().toISOString(), posts: data.posts.filter((p) => p.post_id !== postId) });
  invalidateIndexCache();
}

/** index.json 읽기. 없으면 재생성. */
export async function readIndex(drive: DriveClient): Promise<IndexFile> {
  const { data, fileId } = await readIndexFile(drive);
  if (!fileId) return rebuildIndex(drive);
  return data;
}

export function invalidateIndexCache(): void {
  try {
    revalidateTag(INDEX_CACHE_TAG, "max");
  } catch {
    // 요청 컨텍스트 밖(테스트 등)에서는 무시
  }
}
