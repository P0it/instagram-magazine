import "server-only";
import type { PostBundle } from "@/types";
import { getDrive, isImageMime } from "@/lib/drive";
import { ensureSubfolder, loadPost, toBundle, writeMetadata } from "./post-repo";
import { readImageDims } from "./image-dims";
import { upsertIndexEntry } from "./index-builder";

export class BadImageError extends Error {
  constructor() {
    super("only PNG/JPEG/WebP supported");
    this.name = "BadImageError";
  }
}

/**
 * 포스트 assets 폴더에 이미지를 저장한다. kind=cutout 은 cutout_NN.png(누끼 라이브러리),
 * source 는 source_NN 이며 slideId 가 있으면 그 슬라이드의 asset 을 교체한다.
 */
export async function addAssetToPost(
  postId: string,
  bytes: Uint8Array,
  opts: { kind: "source" | "cutout"; slideId?: string; mimeHint?: string },
): Promise<PostBundle & { uploaded: string }> {
  const dims = readImageDims(bytes);
  if (!dims) throw new BadImageError();
  const mime = opts.mimeHint && isImageMime(opts.mimeHint) ? opts.mimeHint : `image/${dims.format === "jpeg" ? "jpeg" : dims.format}`;
  const ext = dims.format === "jpeg" ? "jpg" : dims.format;

  const drive = await getDrive();
  const post = await loadPost(drive, postId);
  const assetsFolder = await ensureSubfolder(drive, post, "assets");
  const existing = await drive.listChildren(assetsFolder.id);
  const re = opts.kind === "cutout" ? /cutout_(\d+)/ : /source_(\d+)/;
  const nums = existing.map((f) => Number(re.exec(f.name)?.[1] ?? 0));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  const name = `${opts.kind}_${String(next).padStart(2, "0")}.${ext}`;
  await drive.uploadBytes(assetsFolder.id, name, bytes, mime);

  const now = new Date().toISOString();
  const slideId = opts.kind === "source" ? opts.slideId : undefined;
  const slides = slideId ? post.metadata.slides.map((s) => (s.id === slideId ? { ...s, asset: name } : s)) : post.metadata.slides;
  const metadata = await writeMetadata(drive, post.folderId, {
    ...post.metadata,
    slides,
    asset_mode: opts.kind === "source" && post.metadata.asset_mode === "text_only" ? "upload" : post.metadata.asset_mode,
    updated_at: now,
  });
  const reloaded = await loadPost(drive, postId);
  await upsertIndexEntry(drive, { ...reloaded, metadata });
  return { ...toBundle({ ...reloaded, metadata }), uploaded: name };
}
