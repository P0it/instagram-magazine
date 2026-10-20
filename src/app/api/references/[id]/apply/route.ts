import { z } from "zod";
import { applyReference } from "@/lib/ai/reference-applier";
import { listReferences, ReferenceNotFoundError } from "@/lib/references";
import { error, handle, json, readJsonBody } from "@/lib/api/respond";

export const maxDuration = 300;
type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({ topic: z.string().trim().min(2).max(120) });

/** POST /api/references/[id]/apply { topic } — 이 레퍼런스의 구조를 내 주제에 옮긴 제목 후보·슬라이드 구성안. 저장하지 않는다. */
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { topic } = Body.parse(await readJsonBody(req));
    const ref = (await listReferences()).find((r) => r.id === id);
    if (!ref) return error(404, new ReferenceNotFoundError(id).message, "not_found");
    if (!ref.insight) return error(422, "먼저 전문가 분석을 실행해 주세요.", "no_insight");
    return json(await applyReference(ref, topic));
  });
}
