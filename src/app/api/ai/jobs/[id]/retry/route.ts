import { retryJob } from "@/lib/ai/jobs/queue";
import { handle, json } from "@/lib/api/respond";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/ai/jobs/[id]/retry — 실패·취소된 작업의 입력으로 새 작업을 만든다 */
export async function POST(_req: Request, ctx: Ctx) {
  return handle(async () => json({ job: await retryJob((await ctx.params).id) }, { status: 201 }));
}
