import { deleteLibraryPhoto, PhotoNotFoundError } from "@/lib/photos";
import { error, handle, json } from "@/lib/api/respond";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/photos/[id] — 라이브러리에서 사진을 지운다 (Drive 파일 포함) */
export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    try {
      return json({ photos: await deleteLibraryPhoto(id) });
    } catch (e) {
      if (e instanceof PhotoNotFoundError) return error(404, e.message, "not_found");
      throw e;
    }
  });
}
