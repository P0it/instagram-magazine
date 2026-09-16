import type { StylePack } from "@/types";
import { getDrive } from "@/lib/drive";
import { importStylePack, listStylePacks } from "@/lib/style-pack/importer";
import { handle, json, readJsonBody } from "@/lib/api/respond";

/** GET /api/style-packs — 내장 + Drive 스타일팩 */
export async function GET() {
  return handle(async () => {
    const drive = await getDrive();
    return json<{ packs: StylePack[] }>({ packs: await listStylePacks(drive) });
  });
}

/** POST /api/style-packs — style-pack.json 임포트 */
export async function POST(req: Request) {
  return handle(async () => {
    const drive = await getDrive();
    const pack = await importStylePack(drive, await readJsonBody(req));
    return json<StylePack>(pack, { status: 201 });
  });
}
