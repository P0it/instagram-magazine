import type { PostBundle } from "@/types";
import { getDrive, isImageMime } from "@/lib/drive";
import { ensureSubfolder, loadPost, toBundle, writeMetadata } from "@/lib/metadata/post-repo";
import { readImageDims } from "@/lib/metadata/image-dims";
import { upsertIndexEntry } from "@/lib/metadata/index-builder";
import { error, handle, json } from "@/lib/api/respond";

type Ctx = { params: Promise<{ id: string }> };
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * POST /api/posts/[id]/assets — multipart { file, slide_id? }
 * 업로드 후 slide_id 가 있으면 해당 슬라이드의 asset 을 교체한다.
 */
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return error(400, "file field missing", "no_file");
    if (file.size > MAX_BYTES) return error(413, "file exceeds 15MB", "too_large");
    const slideId = form.get("slide_id")?.toString() || undefined;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const dims = readImageDims(bytes);
    if (!dims) return error(400, "only PNG/JPEG/WebP supported", "bad_image");
    const mime = file.type && isImageMime(file.type) ? file.type : `image/${dims.format === "jpeg" ? "jpeg" : dims.format}`;
    const ext = dims.format === "jpeg" ? "jpg" : dims.format;

    const drive = await getDrive();
    const post = await loadPost(drive, id);
    const assetsFolder = await ensureSubfolder(drive, post, "assets");
    const existing = await drive.listChildren(assetsFolder.id);
    const nums = existing.map((f) => Number(/source_(\d+)/.exec(f.name)?.[1] ?? 0));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    const name = `source_${String(next).padStart(2, "0")}.${ext}`;
    await drive.uploadBytes(assetsFolder.id, name, bytes, mime);

    const now = new Date().toISOString();
    const slides = slideId ? post.metadata.slides.map((s) => (s.id === slideId ? { ...s, asset: name } : s)) : post.metadata.slides;
    const metadata = await writeMetadata(drive, post.folderId, {
      ...post.metadata,
      slides,
      asset_mode: post.metadata.asset_mode === "text_only" ? "upload" : post.metadata.asset_mode,
      updated_at: now,
    });
    const reloaded = await loadPost(drive, id);
    await upsertIndexEntry(drive, { ...reloaded, metadata });
    return json<PostBundle & { uploaded: string }>({ ...toBundle({ ...reloaded, metadata }), uploaded: name });
  });
}
