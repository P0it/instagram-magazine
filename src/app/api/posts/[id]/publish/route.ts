import { PublishRequestSchema, type PublishResult } from "@/types";
import { getDrive } from "@/lib/drive";
import { publishPost } from "@/lib/publish/publish-post";
import { transitionPost } from "@/lib/metadata/transition-service";
import { handle, json, readJsonBody } from "@/lib/api/respond";

type Ctx = { params: Promise<{ id: string }> };

// Vercel Hobby 함수 상한. 캐러셀 10장도 보통 수십 초.
export const maxDuration = 60;

/**
 * POST /api/posts/[id]/publish { account_key, mode, run_at? }
 * - immediate: 동기 게시 (사용자의 명시적 호출)
 * - scheduled: `scheduled` 로 표시만. 실제 게시는 /api/cron/publish 가 run_at 이후 실행.
 */
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = PublishRequestSchema.parse(await readJsonBody(req));
    const drive = await getDrive();
    if (body.mode === "scheduled") {
      const bundle = await transitionPost(drive, id, "scheduled", { run_at: body.run_at, account_key: body.account_key });
      return json<PublishResult>({ ok: true, status: bundle.metadata.status });
    }
    const result = await publishPost(drive, id, body.account_key);
    return json<PublishResult>(result, { status: result.ok ? 200 : 502 });
  });
}
