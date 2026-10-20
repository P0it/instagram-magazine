import { cancelJob } from "@/lib/ai/jobs/queue";
import { handle, json } from "@/lib/api/respond";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/ai/jobs/[id]/cancel — 대기 중이면 바로, 실행 중이면 다음 AI 호출 전에 취소 */
export async function POST(_req: Request, ctx: Ctx) {
  return handle(async () => json({ job: await cancelJob((await ctx.params).id) }));
}
