import "server-only";
import type { PostMetadata, PublishResult } from "@/types";
import type { DriveClient } from "@/lib/drive/types";
import { env, encryptionKey } from "@/lib/env";
import { issueSignedToken, SIGNED_URL_TTL_SECONDS } from "@/lib/crypto/signed-url";
import {
  loadPost,
  movePostFolderForStatus,
  writeMetadata,
  type LoadedPost,
} from "@/lib/metadata/post-repo";
import { upsertIndexEntry } from "@/lib/metadata/index-builder";
import { fullCaption } from "@/lib/metadata/approval-gate";
import { canTransition, isStaleLock } from "@/lib/metadata/transitions";
import { accessTokenOf, getAccount } from "@/lib/instagram/accounts";
import {
  createCarouselContainer,
  createImageContainer,
  publishMedia,
  waitForContainer,
} from "@/lib/instagram/client";

export interface PublishDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  baseUrl?: string;
}

export class PublishPreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishPreconditionError";
  }
}

/** 렌더 파일 → IG 가 읽을 수 있는 서명 URL */
export function signedRenderUrl(baseUrl: string, postId: string, fileId: string, nowSec: number): string {
  const token = issueSignedToken({ p: postId, f: fileId, e: nowSec + SIGNED_URL_TTL_SECONDS }, encryptionKey());
  return `${baseUrl.replace(/\/$/, "")}/api/public/${token}`;
}

/**
 * §8 게시 흐름. 사용자의 명시적 호출로만 실행된다 (자동 게시 금지).
 * - approved | scheduled | failed(재시도) 에서 시작
 * - publishing 락 → 컨테이너 → FINISHED 폴링 → media_publish → published + 폴더 이동
 * - 실패: attempt++, last_error, status=failed (폴더 이동 없음)
 */
export async function publishPost(
  drive: DriveClient,
  postId: string,
  accountKey: string,
  deps: PublishDeps = {},
): Promise<PublishResult> {
  const f = deps.fetch ?? fetch;
  const now = deps.now ?? (() => new Date());
  const baseUrl = deps.baseUrl ?? env().APP_BASE_URL;

  let post = await loadPost(drive, postId);
  const m = post.metadata;

  // 전제 조건
  if (m.status === "publishing" && !isStaleLock(m.publish?.locked_at, now().getTime())) {
    throw new PublishPreconditionError("이미 게시 중입니다 (락 유지 중)");
  }
  const from = m.status === "publishing" ? "approved" : m.status === "failed" ? "approved" : m.status;
  if (!canTransition(from, "publishing")) {
    throw new PublishPreconditionError(`상태 ${m.status} 에서는 게시할 수 없습니다`);
  }
  if (post.renders.length === 0 || post.renders.length !== m.slides.length) {
    throw new PublishPreconditionError(`렌더 ${post.renders.length}장 / 슬라이드 ${m.slides.length}장 — 렌더를 먼저 저장하세요`);
  }
  const account = await getAccount(drive, accountKey);
  if (!account) throw new PublishPreconditionError(`연결된 Instagram 계정이 없습니다: ${accountKey}`);
  const attempt = (m.publish?.attempt ?? 0) + 1;
  const maxAttempts = m.publish?.max_attempts ?? 3;
  if (attempt > maxAttempts) {
    throw new PublishPreconditionError(`최대 재시도 횟수(${maxAttempts})를 초과했습니다`);
  }

  // 1. 락
  const lockedAt = now().toISOString();
  let metadata: PostMetadata = {
    ...m,
    status: "publishing",
    publish: {
      ...(m.publish ?? { mode: "immediate", attempt: 0, max_attempts: 3 }),
      account_key: accountKey,
      attempt,
      locked_at: lockedAt,
      last_error: undefined,
    },
    updated_at: lockedAt,
  };
  metadata = await writeMetadata(drive, post.folderId, metadata);

  try {
    const token = accessTokenOf(account);
    const nowSec = Math.floor(now().getTime() / 1000);
    const caption = fullCaption(metadata);

    // 2. 서명 URL
    const urls = post.renders.map((r) => signedRenderUrl(baseUrl, postId, r.fileId, nowSec));

    // 3. 컨테이너
    let creationId: string;
    if (urls.length === 1) {
      creationId = await createImageContainer(
        { igUserId: account.ig_user_id, token, imageUrl: urls[0], caption, altText: metadata.alt_text },
        f,
      );
    } else {
      const children: string[] = [];
      for (const url of urls) {
        const id = await createImageContainer({ igUserId: account.ig_user_id, token, imageUrl: url, isCarouselItem: true }, f);
        await waitForContainer(id, token, { timeoutMs: 45_000, sleep: deps.sleep }, f);
        children.push(id);
      }
      creationId = await createCarouselContainer({ igUserId: account.ig_user_id, token, children, caption }, f);
    }
    metadata = await writeMetadata(drive, post.folderId, {
      ...metadata,
      publish: { ...metadata.publish!, ig_creation_id: creationId },
    });

    // 4. FINISHED 폴링
    await waitForContainer(creationId, token, { timeoutMs: 60_000, sleep: deps.sleep }, f);

    // 5. publish
    const mediaId = await publishMedia({ igUserId: account.ig_user_id, token, creationId }, f);

    // 6. published + 폴더 이동
    const publishedAt = now().toISOString();
    metadata = await writeMetadata(drive, post.folderId, {
      ...metadata,
      status: "published",
      scheduled_at: null,
      publish: { ...metadata.publish!, ig_media_id: mediaId, published_at: publishedAt, locked_at: undefined },
      updated_at: publishedAt,
    });
    post = await loadPost(drive, postId);
    const located = await movePostFolderForStatus(drive, post, "published");
    await upsertIndexEntry(drive, { ...post, located, folderStatus: "published", metadata });
    return { ok: true, status: "published", ig_media_id: mediaId };
  } catch (e) {
    const failedAt = now().toISOString();
    const message = e instanceof Error ? e.message : String(e);
    metadata = await writeMetadata(drive, post.folderId, {
      ...metadata,
      status: "failed",
      publish: { ...metadata.publish!, last_error: message, locked_at: undefined },
      updated_at: failedAt,
    });
    const reloaded: LoadedPost = { ...post, metadata };
    await upsertIndexEntry(drive, reloaded);
    return { ok: false, status: "failed", error: message };
  }
}
