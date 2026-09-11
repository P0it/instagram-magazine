import { getDrive } from "@/lib/drive";
import { deleteStylePack, getStylePackById } from "@/lib/style-pack/importer";
import { error, handle, json } from "@/lib/api/respond";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const drive = await getDrive();
    const pack = await getStylePackById(drive, id);
    if (!pack) return error(404, "style pack not found", "not_found");
    return json(pack);
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const drive = await getDrive();
    const removed = await deleteStylePack(drive, id);
    if (!removed) return error(404, "내장 스타일팩이거나 존재하지 않습니다", "not_found");
    return json({ ok: true });
  });
}
