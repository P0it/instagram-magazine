import "server-only";
import { AccountKeySchema, type Account, type PublicAccount } from "@/types";
import type { DriveClient } from "@/lib/drive/types";
import { readAccounts, writeAccounts } from "@/lib/drive/system-files";
import { FOLDER_STATUSES, channelFolderId, inboxFolderId, statusFolderId } from "@/lib/drive/paths";
import { encryptString } from "@/lib/crypto/aes";
import { encryptionKey } from "@/lib/env";
import { toPublicAccount } from "./accounts";

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
}

/**
 * OAuth 성공 = 계정(=채널) 생성.
 * - 같은 ig_user_id 가 있으면 재연결: 토큰·username 만 갱신, key·폴더·설정은 보존.
 * - 없으면 신규: key = username. Drive 에 /inbox/<key>/, /<key>/{draft,approved,published}/ 를 만든다
 *   (이미 있으면 재사용 — 예전에 해제한 계정의 폴더).
 * - 같은 key 를 다른 ig_user_id 가 쓰고 있으면 UsernameTakenError.
 */
export async function connectAccount(drive: DriveClient, input: ConnectInput, now = new Date()): Promise<ConnectResult> {
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

  const existingIdx = data.accounts.findIndex((a) => a.ig_user_id === input.ig_user_id);
  if (existingIdx >= 0) {
    const next: Account = { ...data.accounts[existingIdx], ...token, username };
    const accounts = [...data.accounts];
    accounts[existingIdx] = next;
    await writeAccounts(drive, { accounts }, version);
    return { account: toPublicAccount(next), created: false };
  }

  const parsedKey = AccountKeySchema.safeParse(username);
  if (!parsedKey.success) throw new InvalidUsernameError(input.username);
  const key = parsedKey.data;
  if (data.accounts.some((a) => a.key === key)) throw new UsernameTakenError(key);

  const [inboxId, folderId] = await Promise.all([inboxFolderId(drive, key), channelFolderId(drive, key)]);
  for (const st of FOLDER_STATUSES) await statusFolderId(drive, key, st);

  const account: Account = {
    key,
    ig_user_id: input.ig_user_id,
    username,
    ...token,
    name: username,
    color: "#171717",
    drive_folder_id: folderId,
    inbox_folder_id: inboxId,
    default_style_pack: null,
    default_presets_by_role: {},
    caption_template: "{{caption}}\n\n{{hashtags}}",
    default_hashtags: [],
    editorial_rules: { fact_check_required: false },
  };
  await writeAccounts(drive, { accounts: [...data.accounts, account] }, version);
  return { account: toPublicAccount(account), created: true };
}
