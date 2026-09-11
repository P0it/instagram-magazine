import type { SyncResponse } from "@/types";
import { getDrive } from "@/lib/drive";
import { syncInbox } from "@/lib/ingest/sync";
import { handle, json } from "@/lib/api/respond";

export const maxDuration = 60;

/** POST /api/ingest/sync — inbox 정규화 + index.json 재생성 */
export async function POST() {
  return handle(async () => {
    const drive = await getDrive();
    return json<SyncResponse>(await syncInbox(drive));
  });
}
