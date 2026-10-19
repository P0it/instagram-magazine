import { deleteReference, patchReference, ReferenceNotFoundError } from "@/lib/references";
import { error, handle, json, readJsonBody } from "@/lib/api/respond";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/references/[id] — 메타(제목·태그·메모·팔레트…) 수정 */
export async function PATCH(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    try {
      return json({ references: await patchReference(id, (await readJsonBody(req)) as never) });
    } catch (e) {
      if (e instanceof ReferenceNotFoundError) return error(404, e.message, "not_found");
      throw e;
    }
  });
}

/** DELETE /api/references/[id] — 레퍼런스와 이미지 삭제 */
export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    try {
      return json({ references: await deleteReference(id) });
    } catch (e) {
      if (e instanceof ReferenceNotFoundError) return error(404, e.message, "not_found");
      throw e;
    }
  });
}
