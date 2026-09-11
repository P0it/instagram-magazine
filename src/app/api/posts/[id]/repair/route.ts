import { RepairRequestSchema } from "@/types";
import { getDrive } from "@/lib/drive";
import { repairPost } from "@/lib/metadata/transition-service";
import { handle, json, readJsonBody } from "@/lib/api/respond";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/posts/[id]/repair { strategy: 'folder' | 'metadata' } */
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = RepairRequestSchema.parse(await readJsonBody(req));
    const drive = await getDrive();
    return json(await repairPost(drive, id, body.strategy));
  });
}
