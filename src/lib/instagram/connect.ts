import "server-only";
import { AccountKeySchema, type Account, type AccountKey, type AccountSettings, type PublicAccount } from "@/types";
import type { DriveClient } from "@/lib/drive/types";
import { readAccounts, writeAccounts } from "@/lib/drive/system-files";
import { FOLDER_STATUSES, channelFolderId, inboxFolderId, statusFolderId } from "@/lib/drive/paths";
import { encryptString } from "@/lib/crypto/aes";
import { encryptionKey } from "@/lib/env";
import { isUnlinked, toPublicAccount } from "./accounts";

export class UsernameTakenError extends Error {
  constructor(username: string) {
    super(`@${username} 은(는) 이미 다른 Instagram 계정이 쓰는 키입니다`);
    this.name = "UsernameTakenError";
  }
}

export class InvalidUsernameError extends Error {
  constructor(username: string) {
    super(`Instagram username 을 폴더명으로 쓸 수 없습니다: ${username}`);
    this.name = "InvalidUsernameError";
  }
}

export interface ConnectInput {
  ig_user_id: string;
  username: string;
  access_token: string;
  expires_in_seconds: number;
}

export interface ConnectResult {
  account: PublicAccount;
  created: boolean;
  /** 미리 만들어 둔 unlinked 채널에 계정이 붙은 경우 */
  linked?: boolean;
}

export class ChannelTakenError extends Error {
  constructor(key: string) {
    super(`@${key} 채널은 이미 다른 Instagram 계정에 연결돼 있습니다`);
    this.name = "ChannelTakenError";
  }
}

const defaultSettings = (): Omit<AccountSettings, "name"> => ({
  color: "#171717",
  default_style_pack: null,
  default_presets_by_role: {},
  caption_template: "{{caption}}\n\n{{hashtags}}",
  default_hashtags: [],
  editorial_rules: { fact_check_required: false },
});

async function provisionFolders(drive: DriveClient, key: AccountKey): Promise<{ inboxId: string; folderId: string }> {
  const [inboxId, folderId] = await Promise.all([inboxFolderId(drive, key), channelFolderId(drive, key)]);
  for (const st of FOLDER_STATUSES) await statusFolderId(drive, key, st);
  return { inboxId, folderId };
}

/**
 * Instagram 없이 채널만 먼저 만든다 (status: unlinked). Drive 폴더는 똑같이 생기고 초안 편집까지 가능,
 * 게시만 막힌다. 나중에 OAuth 로 계정을 붙이면 key·폴더·설정은 그대로 유지된다.
 */
export async function createChannel(drive: DriveClient, input: { key: string; name?: string }, now = new Date()): Promise<PublicAccount> {
  const parsedKey = AccountKeySchema.safeParse(input.key.trim().replace(/^@/, "").toLowerCase());
  if (!parsedKey.success) throw new InvalidUsernameError(input.key);
  const key = parsedKey.data;
  const { data, version } = await readAccounts(drive);
  if (data.accounts.some((a) => a.key === key)) throw new UsernameTakenError(key);
  const { inboxId, folderId } = await provisionFolders(drive, key);
  const account: Account = {
    key,
    ig_user_id: "",
    username: key,
    access_token_enc: "",
    token_expires_at: new Date(0).toISOString(),
    last_refreshed_at: now.toISOString(),
    status: "unlinked",
    name: input.name?.trim() || key,
    drive_folder_id: folderId,
    inbox_folder_id: inboxId,
    ...defaultSettings(),
  };
  await writeAccounts(drive, { accounts: [...data.accounts, account] }, version);
  return toPublicAccount(account);
}

/**
 * OAuth 성공 = 계정(=채널) 생성.
 * - 같은 ig_user_id 가 있으면 재연결: 토큰·username 만 갱신, key·폴더·설정은 보존.
 * - 없으면 신규: key = username. Drive 에 /inbox/<key>/, /<key>/{draft,approved,published}/ 를 만든다
 *   (이미 있으면 재사용 — 예전에 해제한 계정의 폴더).
 * - 같은 key 를 다른 ig_user_id 가 쓰고 있으면 UsernameTakenError.
 */
export async function connectAccount(
  drive: DriveClient,
  input: ConnectInput,
  opts: { linkKey?: string | null; now?: Date } = {},
): Promise<ConnectResult> {
  const now = opts.now ?? new Date();
  const username = input.username.trim().toLowerCase();
  const { data, version } = await readAccounts(drive);
  const nowIso = now.toISOString();
  const token = {
    access_token_enc: encryptString(input.access_token, encryptionKey()),
    token_expires_at: new Date(now.getTime() + input.expires_in_seconds * 1000).toISOString(),
    last_refreshed_at: nowIso,
    status: "connected" as const,
    last_error: undefined,
  };

  const existingIdx = data.accounts.findIndex((a) => a.ig_user_id && a.ig_user_id === input.ig_user_id);
  if (existingIdx >= 0) {
    const next: Account = { ...data.accounts[existingIdx], ...token, username };
    const accounts = [...data.accounts];
    accounts[existingIdx] = next;
    await writeAccounts(drive, { accounts }, version);
    return { account: toPublicAccount(next), created: false };
  }

  // 미리 만들어 둔 채널에 붙이기: 명시된 linkKey 가 있으면 그 채널, 없으면 username 과 같은 key 의 unlinked 채널
  const linkIdx = opts.linkKey
    ? data.accounts.findIndex((a) => a.key === opts.linkKey)
    : data.accounts.findIndex((a) => a.key === username && isUnlinked(a));
  if (opts.linkKey && linkIdx < 0) throw new Error(`연결할 채널이 없습니다: ${opts.linkKey}`);
  if (linkIdx >= 0) {
    const target = data.accounts[linkIdx];
    if (!isUnlinked(target)) throw new ChannelTakenError(target.key);
    const next: Account = { ...target, ...token, ig_user_id: input.ig_user_id, username };
    const accounts = [...data.accounts];
    accounts[linkIdx] = next;
    await writeAccounts(drive, { accounts }, version);
    return { account: toPublicAccount(next), created: false, linked: true };
  }

  const parsedKey = AccountKeySchema.safeParse(username);
  if (!parsedKey.success) throw new InvalidUsernameError(input.username);
  const key = parsedKey.data;
  if (data.accounts.some((a) => a.key === key)) throw new UsernameTakenError(key);

  const { inboxId, folderId } = await provisionFolders(drive, key);

  const account: Account = {
    key,
    ig_user_id: input.ig_user_id,
    username,
    ...token,
    name: username,
    drive_folder_id: folderId,
    inbox_folder_id: inboxId,
    ...defaultSettings(),
  };
  await writeAccounts(drive, { accounts: [...data.accounts, account] }, version);
  return { account: toPublicAccount(account), created: true };
}
