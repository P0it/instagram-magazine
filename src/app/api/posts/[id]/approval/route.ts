import type { ApprovalGateResult } from "@/types";
import { getDrive } from "@/lib/drive";
import { loadPost } from "@/lib/metadata/post-repo";
import { evaluateGateFor } from "@/lib/metadata/transition-service";
import { handle, json } from "@/lib/api/respond";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/posts/[id]/approval — 승인 체크리스트 (읽기 전용) */
export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const drive = await getDrive();
    const post = await loadPost(drive, id);
    return json<ApprovalGateResult>(await evaluateGateFor(drive, post));
  });
}
