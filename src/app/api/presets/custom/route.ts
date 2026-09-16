import { CustomPresetSchema, type CustomPresetsFile } from "@/types";
import { getDrive } from "@/lib/drive";
import { readCustomPresets, writeCustomPresets } from "@/lib/drive/system-files";
import { handle, json, readJsonBody } from "@/lib/api/respond";

/** GET /api/presets/custom — 내 프리셋 목록 (_system/custom-presets.json) */
export async function GET() {
  return handle(async () => {
    const drive = await getDrive();
    const { data } = await readCustomPresets(drive);
    return json<CustomPresetsFile>(data);
  });
}

/** POST /api/presets/custom — 프리셋 추가(같은 id 면 교체) */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJsonBody(req);
    const preset = CustomPresetSchema.parse({ ...(body as object), created_at: new Date().toISOString() });
    const drive = await getDrive();
    const { data, version } = await readCustomPresets(drive);
    const presets = [...data.presets.filter((p) => p.id !== preset.id), preset];
    await writeCustomPresets(drive, { presets }, version);
    return json<CustomPresetsFile>({ presets }, { status: 201 });
  });
}
