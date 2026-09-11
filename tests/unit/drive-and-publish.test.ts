import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { MockDriveClient } from "@/mocks/drive/MockDriveClient";
import { seedMockTree } from "@/mocks/seed";
import { syncInbox } from "@/lib/ingest/sync";
import { loadPost } from "@/lib/metadata/post-repo";
import { rebuildIndex } from "@/lib/metadata/index-builder";
import { transitionPost, repairPost, ApprovalGateError } from "@/lib/metadata/transition-service";
import { publishPost } from "@/lib/publish/publish-post";
import { upsertAccount } from "@/lib/instagram/accounts";
import { invalidateFolderCache } from "@/lib/drive/paths";

const KEY = randomBytes(32).toString("base64");
vi.mock("@/lib/env", () => ({
  env: () => ({
    APP_BASE_URL: "https://desk.example.com",
    APP_ACCESS_KEY: "",
    APP_ENCRYPTION_KEY: KEY,
    CRON_SECRET: "",
    DRIVE_CLIENT: "mock",
    GOOGLE_SERVICE_ACCOUNT_JSON: "",
    GOOGLE_DRIVE_ROOT_FOLDER_ID: "",
    META_APP_ID: "",
    META_APP_SECRET: "",
    META_REDIRECT_URI: "",
  }),
  encryptionKey: () => Buffer.from(KEY, "base64"),
  isOauthConfigured: () => false,
}));

async function freshDrive() {
  invalidateFolderCache();
  const tree = MockDriveClient.createEmpty();
  await seedMockTree(tree);
  return new MockDriveClient(tree);
}

describe("MockDriveClient", () => {
  it("writes, overwrites (version++), moves and checks ancestry", async () => {
    const d = await freshDrive();
    const root = d.rootFolderId();
    const folder = await d.createFolder(root, "tmp");
    const f1 = await d.writeText(folder.id, "a.json", "{}");
    const f2 = await d.writeText(folder.id, "a.json", "{\"x\":1}");
    expect(f2.id).toBe(f1.id);
    expect(f2.version).toBe("2");
    expect(await d.readText(f1.id)).toBe("{\"x\":1}");
    const other = await d.createFolder(root, "tmp2");
    await d.moveFile(f1.id, folder.id, other.id);
    expect((await d.listChildren(folder.id)).length).toBe(0);
    expect((await d.listChildren(other.id)).map((x) => x.id)).toEqual([f1.id]);
    expect(await d.isDescendantOf(f1.id, root)).toBe(true);
    expect(await d.isDescendantOf(root, f1.id)).toBe(false);
  });
});

describe("index + ingest", () => {
  it("rebuilds index from seed and flags warnings", async () => {
    const d = await freshDrive();
    const idx = await rebuildIndex(d);
    expect(idx.posts.length).toBeGreaterThanOrEqual(9);
    const draft = idx.posts.find((p) => p.post_id === "2026-09-11_youth-housing-support")!;
    expect(draft.status).toBe("draft");
    expect(draft.warnings).toContain("missing_render");
    const approved = idx.posts.find((p) => p.post_id === "2026-09-10_transit-pass-changes")!;
    expect(approved.render_count).toBe(3);
    expect(approved.warnings).toEqual([]);
  });

  it("syncInbox normalizes inbox files idempotently", async () => {
    const d = await freshDrive();
    const r1 = await syncInbox(d);
    expect(r1.created).toBe(2);
    expect(r1.needs_repair).toBe(1);
    const post = await loadPost(d, "2026-09-12_free-health-checkup");
    expect(post.metadata.status).toBe("draft");
    expect(post.metadata.slides).toHaveLength(4);
    expect(post.metadata.slides[0].asset).toBe("source_01.png");
    expect(post.metadata.hashtags).toContain("건강검진");
    expect(post.metadata.hashtags).toContain("생활정보"); // 채널 기본 해시태그 병합
    expect(post.assets).toHaveLength(2);
    expect(post.sources.items[0].publisher).toBe("국민건강보험공단");
    const original = await d.findChild(post.folderId, "_inbox_original");
    expect(original).not.toBeNull();
    expect((await d.listChildren(original!.id)).length).toBe(3);

    const r2 = await syncInbox(d);
    expect(r2.created).toBe(0);
    expect(r2.skipped).toBe(0); // 원본이 이동되어 inbox 비어있음
  });
});

describe("transitions", () => {
  it("draft → approved blocked by gate without renders; approved → draft moves folder", async () => {
    const d = await freshDrive();
    await expect(transitionPost(d, "2026-09-11_youth-housing-support", "approved")).rejects.toBeInstanceOf(ApprovalGateError);
    const b = await transitionPost(d, "2026-09-10_transit-pass-changes", "draft");
    expect(b.metadata.status).toBe("draft");
    expect(b.folderStatus).toBe("draft");
    const reloaded = await loadPost(d, "2026-09-10_transit-pass-changes");
    expect(reloaded.located.folderStatus).toBe("draft");
  });
  it("schedule requires run_at and account; cancel returns to approved", async () => {
    const d = await freshDrive();
    await expect(transitionPost(d, "2026-09-10_transit-pass-changes", "scheduled")).rejects.toThrow();
    const s = await transitionPost(d, "2026-09-10_transit-pass-changes", "scheduled", { run_at: "2030-01-01T00:00:00.000Z", account_key: "life" });
    expect(s.metadata.publish?.mode).toBe("scheduled");
    const back = await transitionPost(d, "2026-09-10_transit-pass-changes", "approved");
    expect(back.metadata.scheduled_at).toBeNull();
  });
  it("repair by folder / by metadata", async () => {
    const d = await freshDrive();
    // 인위적으로 mismatch: approved 포스트의 메타를 draft 로 바꿔 씀
    const post = await loadPost(d, "2026-09-10_transit-pass-changes");
    await d.writeText(post.folderId, "metadata.json", JSON.stringify({ ...post.metadata, status: "draft" }));
    const idx = await rebuildIndex(d);
    expect(idx.posts.find((p) => p.post_id === post.metadata.post_id)!.warnings).toContain("status_mismatch");
    const fixed = await repairPost(d, post.metadata.post_id, "folder");
    expect(fixed.metadata.status).toBe("approved");
    await d.writeText(post.folderId, "metadata.json", JSON.stringify({ ...post.metadata, status: "draft" }));
    const fixed2 = await repairPost(d, post.metadata.post_id, "metadata");
    expect(fixed2.folderStatus).toBe("draft");
  });
});

describe("publishPost (IG mocked)", () => {
  function fakeFetch(behaviour: "ok" | "fail-container" | "fail-publish") {
    let n = 0;
    return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
      const path = url.pathname;
      const method = init?.method ?? "GET";
      const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      const bad = (msg: string) => new Response(JSON.stringify({ error: { message: msg, code: 9004 } }), { status: 400 });
      if (path.endsWith("/media") && method === "POST") {
        n++;
        if (behaviour === "fail-container" && url.searchParams.get("media_type") === "CAROUSEL") return bad("carousel failed");
        return ok({ id: `c${n}` });
      }
      if (path.endsWith("/media_publish")) {
        if (behaviour === "fail-publish") return bad("publish failed");
        return ok({ id: "media_123" });
      }
      if (/\/c\d+$/.test(path)) return ok({ status_code: "FINISHED" });
      return bad(`unexpected ${method} ${path}`);
    });
  }
  const deps = (f: ReturnType<typeof fakeFetch>) => ({ fetch: f as unknown as typeof fetch, sleep: async () => {}, now: () => new Date("2026-09-11T12:00:00Z") });

  async function driveWithAccount() {
    const d = await freshDrive();
    await upsertAccount(d, { key: "life", ig_user_id: "178", username: "life_mag", access_token: "tok", expires_in_seconds: 5_000_000 });
    return d;
  }

  it("publishes a carousel and moves folder to published", async () => {
    const d = await driveWithAccount();
    const f = fakeFetch("ok");
    const r = await publishPost(d, "2026-09-10_transit-pass-changes", "life", deps(f));
    expect(r).toEqual({ ok: true, status: "published", ig_media_id: "media_123" });
    const post = await loadPost(d, "2026-09-10_transit-pass-changes");
    expect(post.metadata.status).toBe("published");
    expect(post.located.folderStatus).toBe("published");
    expect(post.metadata.publish?.published_at).toBe("2026-09-11T12:00:00.000Z");
    // 3 children + 1 carousel container + 1 publish
    const mediaCalls = f.mock.calls.filter(([u]) => String(u).includes("/media?"));
    expect(mediaCalls).toHaveLength(4);
    // 서명 URL 이 image_url 로 전달됨
    expect(String(mediaCalls[0][0])).toContain(encodeURIComponent("https://desk.example.com/api/public/"));
  });

  it("marks failed without moving folder, then retry works", async () => {
    const d = await driveWithAccount();
    const r = await publishPost(d, "2026-09-10_transit-pass-changes", "life", deps(fakeFetch("fail-publish")));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("publish failed");
    let post = await loadPost(d, "2026-09-10_transit-pass-changes");
    expect(post.metadata.status).toBe("failed");
    expect(post.metadata.publish?.attempt).toBe(1);
    expect(post.located.folderStatus).toBe("approved");
    const r2 = await publishPost(d, "2026-09-10_transit-pass-changes", "life", deps(fakeFetch("ok")));
    expect(r2.ok).toBe(true);
    post = await loadPost(d, "2026-09-10_transit-pass-changes");
    expect(post.metadata.publish?.attempt).toBe(2);
  });

  it("refuses to publish a draft without renders", async () => {
    const d = await driveWithAccount();
    await expect(publishPost(d, "2026-09-11_youth-housing-support", "life", deps(fakeFetch("ok")))).rejects.toThrow(/게시할 수 없습니다|렌더/);
  });
});
