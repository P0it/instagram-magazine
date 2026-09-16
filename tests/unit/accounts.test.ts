import { describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { MockDriveClient } from "@/mocks/drive/MockDriveClient";
import { seedMockTree } from "@/mocks/seed";
import { connectAccount, UsernameTakenError } from "@/lib/instagram/connect";
import { accessTokenOf, getAccount, listAccountKeys, listPublicAccounts, removeAccount, updateAccountSettings } from "@/lib/instagram/accounts";
import { invalidateFolderCache, inboxFolderId, listAllPostFolders, statusFolderId } from "@/lib/drive/paths";
import { syncInbox } from "@/lib/ingest/sync";
import { loadPost } from "@/lib/metadata/post-repo";

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

async function seeded() {
  invalidateFolderCache();
  const tree = MockDriveClient.createEmpty();
  await seedMockTree(tree);
  return new MockDriveClient(tree);
}

async function empty() {
  invalidateFolderCache();
  const tree = MockDriveClient.createEmpty();
  const d = new MockDriveClient(tree);
  await d.ensureFolder(d.rootFolderId(), ["_system"]);
  return d;
}

const input = (username: string, ig_user_id = `ig-${username}`) => ({
  ig_user_id,
  username,
  access_token: `tok-${username}`,
  expires_in_seconds: 60 * 86_400,
});

describe("connectAccount (OAuth = account creation)", () => {
  it("creates the account and its Drive folders on first connect", async () => {
    const d = await empty();
    expect(await listAccountKeys(d)).toEqual([]);

    const r = await connectAccount(d, input("New.Mag"));
    expect(r.created).toBe(true);
    expect(r.account.key).toBe("new.mag");
    expect(r.account.username).toBe("new.mag");
    expect(r.account.name).toBe("new.mag");
    expect(r.account).not.toHaveProperty("access_token_enc");

    const stored = await getAccount(d, "new.mag");
    expect(stored).not.toBeNull();
    expect(accessTokenOf(stored!)).toBe("tok-New.Mag");
    expect(stored!.inbox_folder_id).toBe(await inboxFolderId(d, "new.mag"));
    for (const st of ["draft", "approved", "published"] as const) {
      expect(await statusFolderId(d, "new.mag", st)).toBeTruthy();
    }
    expect(await listAccountKeys(d)).toEqual(["new.mag"]);
  });

  it("reconnect by ig_user_id refreshes the token and keeps key, folders, settings", async () => {
    const d = await seeded();
    await updateAccountSettings(d, "life.magazine", { name: "라이프 매거진", default_hashtags: ["x"] });
    const before = (await getAccount(d, "life.magazine"))!;

    // 핸들이 바뀐 채로 재연결
    const r = await connectAccount(d, input("life_renamed", before.ig_user_id));
    expect(r.created).toBe(false);
    expect(r.account.key).toBe("life.magazine");
    expect(r.account.username).toBe("life_renamed");
    expect(r.account.name).toBe("라이프 매거진");
    expect(r.account.default_hashtags).toEqual(["x"]);
    expect(r.account.inbox_folder_id).toBe(before.inbox_folder_id);
    expect(accessTokenOf((await getAccount(d, "life.magazine"))!)).toBe("tok-life_renamed");
    expect((await listAccountKeys(d)).length).toBe(2);
  });

  it("rejects a username already used as key by a different Instagram user", async () => {
    const d = await seeded();
    await expect(connectAccount(d, input("life.magazine", "someone-else"))).rejects.toBeInstanceOf(UsernameTakenError);
  });

  it("rejects usernames that cannot be folder names", async () => {
    const d = await empty();
    await expect(connectAccount(d, input("bad name!"))).rejects.toThrow(/username/);
  });

  it("disconnect keeps folders and posts; reconnect reuses them", async () => {
    const d = await seeded();
    const before = (await listAllPostFolders(d)).filter((f) => f.channel === "trend.magazine").length;
    expect(before).toBeGreaterThan(0);
    const inbox = (await getAccount(d, "trend.magazine"))!.inbox_folder_id;

    await removeAccount(d, "trend.magazine");
    expect(await listAccountKeys(d)).toEqual(["life.magazine"]);
    // 계정이 사라지면 그 채널의 포스트는 순회에서 빠진다 (폴더는 Drive 에 남아 있다)
    expect((await listAllPostFolders(d)).some((f) => f.channel === "trend.magazine")).toBe(false);
    expect((await d.getFile(inbox)).id).toBe(inbox);

    const r = await connectAccount(d, input("trend.magazine", "fresh-id"));
    expect(r.created).toBe(true);
    expect(r.account.inbox_folder_id).toBe(inbox);
    expect((await listAllPostFolders(d)).filter((f) => f.channel === "trend.magazine").length).toBe(before);
  });
});

describe("updateAccountSettings", () => {
  it("changes only settings fields; identity, token and folders are immutable", async () => {
    const d = await seeded();
    const before = (await getAccount(d, "life.magazine"))!;
    const r = await updateAccountSettings(d, "life.magazine", {
      name: "새 이름",
      color: "#123456",
      editorial_rules: { fact_check_required: false },
      // @ts-expect-error — 스키마 밖 필드는 무시된다
      key: "hacked", ig_user_id: "0", access_token_enc: "x", inbox_folder_id: "y",
    });
    expect(r?.name).toBe("새 이름");
    expect(r?.color).toBe("#123456");
    const after = (await getAccount(d, "life.magazine"))!;
    expect(after.key).toBe("life.magazine");
    expect(after.ig_user_id).toBe(before.ig_user_id);
    expect(after.access_token_enc).toBe(before.access_token_enc);
    expect(after.inbox_folder_id).toBe(before.inbox_folder_id);
    expect(after.editorial_rules.fact_check_required).toBe(false);
    expect(await updateAccountSettings(d, "nope", { name: "x" })).toBeNull();
  });

  it("public accounts never carry the token", async () => {
    const d = await seeded();
    for (const a of await listPublicAccounts(d)) expect(a).not.toHaveProperty("access_token_enc");
  });
});

describe("ingest follows accounts", () => {
  it("new account's inbox is scanned and uses its settings", async () => {
    const d = await seeded();
    const { account } = await connectAccount(d, input("fresh.mag"));
    await updateAccountSettings(d, "fresh.mag", { default_hashtags: ["fresh"], editorial_rules: { fact_check_required: true } });
    await d.writeText(account.inbox_folder_id, "2026-09-16_hello.md", "---\nheadline: Hi\n---\n## slide 1 (cover)\nHi\n## caption\nc", "text/markdown");

    const r = await syncInbox(d);
    const entry = r.entries.find((e) => e.channel === "fresh.mag" && e.result === "created");
    expect(entry?.post_id).toBe("2026-09-16_hello");
    const post = await loadPost(d, "2026-09-16_hello");
    expect(post.metadata.channel).toBe("fresh.mag");
    expect(post.metadata.hashtags).toContain("fresh");
    expect(post.metadata.fact_check_required).toBe(true);
    expect(post.located.folderStatus).toBe("draft");
  });

  it("with zero accounts sync is a no-op", async () => {
    const d = await empty();
    const r = await syncInbox(d);
    expect(r.entries).toEqual([]);
    expect(r.created).toBe(0);
  });
});
