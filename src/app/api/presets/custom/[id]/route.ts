import type { CustomPresetsFile } from "@/types";
import { getDrive } from "@/lib/drive";
import { readCustomPresets, writeCustomPresets } from "@/lib/drive/system-files";
import { error, handle, json } from "@/lib/api/respond";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/presets/custom/[id] */
export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const drive = await getDrive();
    const { data, version } = await readCustomPresets(drive);
    if (!data.presets.some((p) => p.id === id)) return error(404, "preset not found", "not_found");
    const presets = data.presets.filter((p) => p.id !== id);
    await writeCustomPresets(drive, { presets }, version);
    return json<CustomPresetsFile>({ presets });
  });
}
