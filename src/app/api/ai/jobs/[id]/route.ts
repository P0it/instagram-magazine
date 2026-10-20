import { getJob } from "@/lib/ai/jobs/queue";
import { handle, json } from "@/lib/api/respond";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/ai/jobs/[id] */
export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => json({ job: await getJob((await ctx.params).id) }));
}
