import "server-only";
import type { PostBundle, PostStatus } from "@/types";
import type { DriveClient } from "@/lib/drive/types";
import { evaluateApprovalGate } from "./approval-gate";
import { upsertIndexEntry } from "./index-builder";
import {
  InvalidTransitionError,
  loadPost,
  movePostFolderForStatus,
  readRenderDims,
  toBundle,
  writeMetadata,
  type LoadedPost,
} from "./post-repo";
import { canTransition, folderForStatus, statusForFolder } from "./transitions";

export class ApprovalGateError extends Error {
  constructor(readonly failures: string[]) {
    super(`승인 게이트 실패: ${failures.join(", ")}`);
    this.name = "ApprovalGateError";
  }
}

export async function evaluateGateFor(drive: DriveClient, post: LoadedPost) {
  const renderDims = await readRenderDims(drive, post.renders);
  return evaluateApprovalGate({ metadata: post.metadata, sources: post.sources, renderDims });
}

/**
 * 사용자 유발 상태 전이. publishing/published 는 여기서 만들 수 없다 (게시 흐름 전용).
 * draft → approved 는 승인 게이트를 서버에서 강제.
 */
export async function transitionPost(
  drive: DriveClient,
  postId: string,
  to: PostStatus,
  opts: { run_at?: string; account_key?: string } = {},
): Promise<PostBundle> {
  const post = await loadPost(drive, postId);
  const from = post.metadata.status;
  if (to === "publishing" || to === "published") throw new InvalidTransitionError(from, to);
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);

  if (to === "approved" && from === "draft") {
    const gate = await evaluateGateFor(drive, post);
    if (!gate.ok) throw new ApprovalGateError(gate.checks.filter((c) => !c.ok).map((c) => c.label));
  }

  const now = new Date().toISOString();
  let publish = post.metadata.publish;
  let scheduledAt = post.metadata.scheduled_at;
  if (to === "scheduled") {
    if (!opts.run_at || Number.isNaN(Date.parse(opts.run_at))) throw new InvalidTransitionError(from, to);
    const accountKey = opts.account_key ?? publish?.account_key;
    if (!accountKey) throw new Error("예약에는 account_key 가 필요합니다");
    publish = { account_key: accountKey, mode: "scheduled", run_at: opts.run_at, attempt: publish?.attempt ?? 0, max_attempts: publish?.max_attempts ?? 3 };
    scheduledAt = opts.run_at;
  } else if (from === "scheduled" && to === "approved") {
    publish = publish ? { ...publish, mode: "immediate", run_at: undefined } : undefined;
    scheduledAt = null;
  } else if (from === "failed" && to === "approved") {
    publish = publish ? { ...publish, last_error: undefined, locked_at: undefined } : undefined;
  }

  const metadata = await writeMetadata(drive, post.folderId, {
    ...post.metadata,
    status: to,
    publish,
    scheduled_at: scheduledAt,
    updated_at: now,
  });
  const located = await movePostFolderForStatus(drive, post, to);
  const updated: LoadedPost = { ...post, metadata, located, folderStatus: statusForFolder(located.folderStatus) };
  await upsertIndexEntry(drive, updated);
  return toBundle(updated);
}

/** status_mismatch 복구: 폴더 기준(메타를 폴더에 맞춤) / 메타 기준(폴더를 메타에 맞춤) */
export async function repairPost(drive: DriveClient, postId: string, strategy: "folder" | "metadata"): Promise<PostBundle> {
  const post = await loadPost(drive, postId);
  const now = new Date().toISOString();
  if (strategy === "folder") {
    const status = statusForFolder(post.located.folderStatus);
    const metadata = await writeMetadata(drive, post.folderId, {
      ...post.metadata,
      status,
      warnings: post.metadata.warnings.filter((w) => w !== "missing_metadata" && w !== "invalid_metadata"),
      publish: status === "published" ? post.metadata.publish : post.metadata.publish ? { ...post.metadata.publish, locked_at: undefined } : undefined,
      updated_at: now,
    });
    const updated: LoadedPost = { ...post, metadata };
    await upsertIndexEntry(drive, updated);
    return toBundle(updated);
  }
  const target = folderForStatus(post.metadata.status);
  const located = post.located.folderStatus === target ? post.located : await movePostFolderForStatus(drive, post, post.metadata.status);
  const metadata = await writeMetadata(drive, post.folderId, { ...post.metadata, updated_at: now });
  const updated: LoadedPost = { ...post, metadata, located, folderStatus: statusForFolder(located.folderStatus) };
  await upsertIndexEntry(drive, updated);
  return toBundle(updated);
}
