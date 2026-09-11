import "server-only";
import type { PublishResult } from "@/types";
import type { DriveClient } from "@/lib/drive/types";
import { readIndex } from "@/lib/metadata/index-builder";
import { publishPost, type PublishDeps } from "./publish-post";

export interface ScheduledRunResult {
  ran: { post_id: string; result: PublishResult }[];
  skipped: number;
}

/**
 * 1.1 크론. 사용자가 명시적으로 `scheduled` 로 두고 run_at ≤ now 인 것만 실행.
 * 그 외 어떤 포스트도 자동으로 게시하지 않는다.
 */
export async function runDueScheduled(drive: DriveClient, deps: PublishDeps = {}, limit = 3): Promise<ScheduledRunResult> {
  const now = (deps.now ?? (() => new Date()))().getTime();
  const index = await readIndex(drive);
  const due = index.posts
    .filter((p) => p.status === "scheduled" && p.scheduled_at && Date.parse(p.scheduled_at) <= now)
    .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));

  const ran: ScheduledRunResult["ran"] = [];
  for (const p of due.slice(0, limit)) {
    // account_key 는 metadata.publish 에 있다. publishPost 가 다시 읽어 확인.
    const accountKey = await accountKeyFor(drive, p.post_id);
    if (!accountKey) {
      ran.push({ post_id: p.post_id, result: { ok: false, status: "scheduled", error: "publish.account_key missing" } });
      continue;
    }
    const result = await publishPost(drive, p.post_id, accountKey, deps);
    ran.push({ post_id: p.post_id, result });
  }
  return { ran, skipped: Math.max(0, due.length - limit) };
}

async function accountKeyFor(drive: DriveClient, postId: string): Promise<string | null> {
  const { loadPost } = await import("@/lib/metadata/post-repo");
  const post = await loadPost(drive, postId);
  return post.metadata.publish?.account_key ?? null;
}
