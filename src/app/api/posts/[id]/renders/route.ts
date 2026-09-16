import { z } from "zod";
import { formatDims, type PostBundle } from "@/types";
import { getDrive } from "@/lib/drive";
import { ensureSubfolder, loadPost, renderFileName, toBundle, writeMetadata } from "@/lib/metadata/post-repo";
import { readImageDims } from "@/lib/metadata/image-dims";
import { upsertIndexEntry } from "@/lib/metadata/index-builder";
import { error, handle, json } from "@/lib/api/respond";

type Ctx = { params: Promise<{ id: string }> };

const IndexSchema = z.coerce.number().int().min(0).max(19);

/**
 * PUT /api/posts/[id]/renders — multipart. 필드명 `slide_<index>` (0-based) 로 JPEG 여러 장.
 * 기존 renders 폴더는 비우고 새로 채운다 (슬라이드 수와 정확히 맞추기 위해).
 */
export async function PUT(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const form = await req.formData();
    const drive = await getDrive();
    const post = await loadPost(drive, id);
    const rendersFolder = await ensureSubfolder(drive, post, "renders");
    const want = formatDims(post.metadata.format);

    const incoming: { index: number; bytes: Uint8Array; mime: string }[] = [];
    for (const [key, value] of form.entries()) {
      const m = /^slide_(\d+)$/.exec(key);
      if (!m || !(value instanceof File)) continue;
      const index = IndexSchema.parse(m[1]);
      const bytes = new Uint8Array(await value.arrayBuffer());
      const dims = readImageDims(bytes);
      if (!dims || dims.width !== want.width || dims.height !== want.height) {
        const got = dims ? `${dims.width}x${dims.height}` : "unreadable";
        return error(400, `slide ${index + 1}: render must be ${want.width}x${want.height} (got ${got})`, "bad_render");
      }
      incoming.push({ index, bytes, mime: value.type || "image/jpeg" });
    }
    if (incoming.length === 0) return error(400, "no render files", "empty");
    if (incoming.length !== post.metadata.slides.length) {
      return error(400, `renders ${incoming.length} / slides ${post.metadata.slides.length} mismatch`, "count_mismatch");
    }

    const existing = await drive.listChildren(rendersFolder.id);
    for (const f of existing) await drive.deleteFile(f.id);
    incoming.sort((a, b) => a.index - b.index);
    for (const r of incoming) {
      await drive.uploadBytes(rendersFolder.id, renderFileName(r.index, r.mime === "image/png" ? "png" : "jpg"), r.bytes, r.mime);
    }

    const now = new Date().toISOString();
    const metadata = await writeMetadata(drive, post.folderId, { ...post.metadata, updated_at: now });
    const reloaded = await loadPost(drive, id);
    await upsertIndexEntry(drive, { ...reloaded, metadata });
    return json<PostBundle>(toBundle({ ...reloaded, metadata }));
  });
}
