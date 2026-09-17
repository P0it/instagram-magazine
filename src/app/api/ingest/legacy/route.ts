import { z } from "zod";
import { getDrive } from "@/lib/drive";
import { importLegacyFolder, listLegacyFolders, type LegacyFolder, type LegacyImportResult } from "@/lib/ingest/legacy";
import { handle, json, readJsonBody } from "@/lib/api/respond";

export const maxDuration = 120;

/** GET /api/ingest/legacy — 루트의 레거시 채널 폴더(LIFE, TREND …) 중 가져올 초안이 있는 것 */
export async function GET() {
  return handle(async () => {
    const drive = await getDrive();
    return json<{ folders: LegacyFolder[] }>({ folders: await listLegacyFolders(drive) });
  });
}

const BodySchema = z.object({ source_folder_id: z.string().min(1), account_key: z.string().min(1) });

/** POST /api/ingest/legacy { source_folder_id, account_key } — 그 폴더의 draft/ 초안을 채널로 가져온다 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = BodySchema.parse(await readJsonBody(req));
    const drive = await getDrive();
    return json<LegacyImportResult>(await importLegacyFolder(drive, body.source_folder_id, body.account_key));
  });
}
