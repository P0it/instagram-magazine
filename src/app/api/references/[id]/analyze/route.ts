import { analyzeReference, ReferenceImageError, ReferenceNotFoundError } from "@/lib/references";
import { error, handle, json } from "@/lib/api/respond";

export const maxDuration = 300;
type Ctx = { params: Promise<{ id: string }> };

/** POST /api/references/[id]/analyze — 큐레이터·마케터·UI/UX 분석을 실행해 저장 (AI 호출, 1~2분 걸릴 수 있음) */
export async function POST(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    try {
      return json({ references: await analyzeReference(id) });
    } catch (e) {
      if (e instanceof ReferenceNotFoundError) return error(404, e.message, "not_found");
      if (e instanceof ReferenceImageError) return error(400, e.message, "bad_image");
      throw e;
    }
  });
}
