import { ChannelsFileSchema, type ChannelsFile } from "@/types";
import { getDrive } from "@/lib/drive";
import { readChannels, writeChannels } from "@/lib/drive/system-files";
import { handle, json, readJsonBody } from "@/lib/api/respond";

/** GET /api/channels — _system/channels.json */
export async function GET() {
  return handle(async () => {
    const drive = await getDrive();
    return json<ChannelsFile>((await readChannels(drive)).data);
  });
}

/** PUT /api/channels — 전체 교체 (Zod 검증, version 비교) */
export async function PUT(req: Request) {
  return handle(async () => {
    const body = ChannelsFileSchema.parse(await readJsonBody(req));
    const drive = await getDrive();
    const { version } = await readChannels(drive);
    await writeChannels(drive, body, version);
    return json<ChannelsFile>(body);
  });
}
