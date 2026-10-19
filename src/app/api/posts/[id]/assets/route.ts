import { addAssetToPost, BadImageError } from "@/lib/metadata/assets";
import { error, handle, json } from "@/lib/api/respond";

type Ctx = { params: Promise<{ id: string }> };
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * POST /api/posts/[id]/assets — multipart { file, slide_id?, kind? }
 * kind=cutout 이면 cutout_NN.png 로 저장(누끼 라이브러리), 아니면 source_NN 으로 저장하고
 * slide_id 가 있으면 해당 슬라이드의 asset 을 교체한다.
 */
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return error(400, "file field missing", "no_file");
    if (file.size > MAX_BYTES) return error(413, "file exceeds 15MB", "too_large");
    const kind = form.get("kind")?.toString() === "cutout" ? "cutout" : "source";
    const slideId = kind === "source" ? form.get("slide_id")?.toString() || undefined : undefined;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return json(await addAssetToPost(id, bytes, { kind, slideId, mimeHint: file.type }));
    } catch (e) {
      if (e instanceof BadImageError) return error(400, e.message, "bad_image");
      throw e;
    }
  });
}
