import { addReferenceImages, ReferenceImageError, ReferenceNotFoundError, removeReferenceImage } from "@/lib/references";
import { error, handle, json } from "@/lib/api/respond";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/references/[id]/images — multipart { files[] } 슬라이드 추가 */
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) return error(400, "files missing", "no_files");
    try {
      return json({ references: await addReferenceImages(id, files) });
    } catch (e) {
      if (e instanceof ReferenceNotFoundError) return error(404, e.message, "not_found");
      if (e instanceof ReferenceImageError) return error(400, e.message, "bad_image");
      throw e;
    }
  });
}

/** DELETE /api/references/[id]/images?name=01.jpg — 슬라이드 한 장 삭제 */
export async function DELETE(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const name = new URL(req.url).searchParams.get("name");
    if (!name) return error(400, "name missing", "no_name");
    try {
      return json({ references: await removeReferenceImage(id, name) });
    } catch (e) {
      if (e instanceof ReferenceNotFoundError) return error(404, e.message, "not_found");
      throw e;
    }
  });
}
