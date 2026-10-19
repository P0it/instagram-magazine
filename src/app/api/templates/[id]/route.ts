import type { TemplatesFile } from "@/types";
import { getDrive } from "@/lib/drive";
import { readTemplates, writeTemplates } from "@/lib/drive/system-files";
import { handle, json } from "@/lib/api/respond";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/templates/[id] */
export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const drive = await getDrive();
    const { data, version } = await readTemplates(drive);
    const templates = data.templates.filter((t) => t.id !== id);
    await writeTemplates(drive, { templates }, version);
    return json<TemplatesFile>({ templates });
  });
}
