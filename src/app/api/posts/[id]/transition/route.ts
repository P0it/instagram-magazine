import { TransitionRequestSchema } from "@/types";
import { getDrive } from "@/lib/drive";
import { ApprovalGateError, transitionPost } from "@/lib/metadata/transition-service";
import { error, handle, json, readJsonBody } from "@/lib/api/respond";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/posts/[id]/transition { to, run_at?, account_key? } */
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = TransitionRequestSchema.parse(await readJsonBody(req));
    const drive = await getDrive();
    try {
      return json(await transitionPost(drive, id, body.to, { run_at: body.run_at, account_key: body.account_key }));
    } catch (e) {
      if (e instanceof ApprovalGateError) return error(422, e.message, "approval_gate", e.failures);
      throw e;
    }
  });
}
