import type { PublishResult } from "@/types";
import { getDrive } from "@/lib/drive";
import { loadPost } from "@/lib/metadata/post-repo";
import { publishPost, PublishPreconditionError } from "@/lib/publish/publish-post";
import { handle, json } from "@/lib/api/respond";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 60;

/** POST /api/posts/[id]/retry — failed(또는 stale publishing) → 재게시. 사용자 수동 호출. */
export async function POST(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const drive = await getDrive();
    const post = await loadPost(drive, id);
    const accountKey = post.metadata.publish?.account_key;
    if (!accountKey) throw new PublishPreconditionError("이전 게시 시도 정보가 없습니다 (account_key 없음)");
    if (post.metadata.status !== "failed" && post.metadata.status !== "publishing") {
      throw new PublishPreconditionError(`상태 ${post.metadata.status} 는 재시도 대상이 아닙니다`);
    }
    const result = await publishPost(drive, id, accountKey);
    return json<PublishResult>(result, { status: result.ok ? 200 : 502 });
  });
}
