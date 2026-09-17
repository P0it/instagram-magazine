import "server-only";
import {
  AccountSettingsPatchSchema,
  PublicAccountSchema,
  type Account,
  type AccountKey,
  type AccountSettingsPatch,
  type AccountStatus,
  type PublicAccount,
} from "@/types";
import type { DriveClient } from "@/lib/drive/types";
import { readAccounts, writeAccounts } from "@/lib/drive/system-files";
import { decryptString, encryptString } from "@/lib/crypto/aes";
import { encryptionKey } from "@/lib/env";
import { getMe, refreshLongLivedToken } from "./client";

export const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function computeStatus(expiresAt: string, now = Date.now()): AccountStatus {
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t) || t <= now) return "expired";
  if (t - now < REFRESH_WINDOW_MS) return "expiring";
  return "connected";
}

export function isUnlinked(a: Pick<Account, "status" | "access_token_enc">): boolean {
  return a.status === "unlinked" || !a.access_token_enc;
}

export function toPublicAccount(a: Account): PublicAccount {
  const status = isUnlinked(a) ? "unlinked" : a.status === "error" ? "error" : computeStatus(a.token_expires_at);
  return PublicAccountSchema.parse({ ...a, status });
}

/** 계정(=채널) 전체. 순서는 accounts.json 순(연결 순). */
export async function listAccounts(drive: DriveClient): Promise<Account[]> {
  return (await readAccounts(drive)).data.accounts;
}

export async function listAccountKeys(drive: DriveClient): Promise<AccountKey[]> {
  return (await listAccounts(drive)).map((a) => a.key);
}

export async function listPublicAccounts(drive: DriveClient): Promise<PublicAccount[]> {
  return (await listAccounts(drive)).map(toPublicAccount);
}

export async function getAccount(drive: DriveClient, key: string): Promise<Account | null> {
  return (await listAccounts(drive)).find((a) => a.key === key) ?? null;
}

/** 복호화된 토큰. 서버 안에서만 쓴다 — 절대 응답에 넣지 않는다. */
export function accessTokenOf(account: Account): string {
  if (isUnlinked(account)) throw new Error(`@${account.key} 채널에 아직 Instagram 계정이 연결되지 않았습니다`);
  return decryptString(account.access_token_enc, encryptionKey());
}

/** 설정 필드만 갱신. key·ig_user_id·토큰·폴더 id 는 스키마에서 걸러져 바뀌지 않는다. */
export async function updateAccountSettings(
  drive: DriveClient,
  key: string,
  patch: AccountSettingsPatch,
): Promise<PublicAccount | null> {
  const clean = AccountSettingsPatchSchema.parse(patch);
  const { data, version } = await readAccounts(drive);
  const idx = data.accounts.findIndex((a) => a.key === key);
  if (idx < 0) return null;
  const next: Account = { ...data.accounts[idx], ...clean };
  const accounts = [...data.accounts];
  accounts[idx] = next;
  await writeAccounts(drive, { accounts }, version);
  return toPublicAccount(next);
}

/** 연결 해제. accounts.json 에서만 제거 — Drive 폴더와 포스트는 남긴다. */
export async function removeAccount(drive: DriveClient, key: string): Promise<void> {
  const { data, version } = await readAccounts(drive);
  await writeAccounts(drive, { accounts: data.accounts.filter((a) => a.key !== key) }, version);
}

/**
 * 앱을 열 때 호출. 만료 7일 이내인 계정의 장기 토큰을 refresh 해 저장.
 * 실패해도 던지지 않고 status: error 로 기록.
 */
export async function refreshExpiringAccounts(drive: DriveClient, f: typeof fetch = fetch): Promise<PublicAccount[]> {
  const { data, version } = await readAccounts(drive);
  let changed = false;
  const now = Date.now();
  const accounts = await Promise.all(
    data.accounts.map(async (a): Promise<Account> => {
      if (isUnlinked(a)) return { ...a, status: "unlinked" };
      const status = computeStatus(a.token_expires_at, now);
      if (status !== "expiring") return { ...a, status: a.status === "error" ? "error" : status };
      try {
        const token = accessTokenOf(a);
        const refreshed = await refreshLongLivedToken(token, f);
        changed = true;
        return {
          ...a,
          access_token_enc: encryptString(refreshed.access_token, encryptionKey()),
          token_expires_at: new Date(now + refreshed.expires_in * 1000).toISOString(),
          last_refreshed_at: new Date(now).toISOString(),
          status: "connected",
          last_error: undefined,
        };
      } catch (e) {
        changed = true;
        return { ...a, status: "error", last_error: String(e) };
      }
    }),
  );
  if (changed) await writeAccounts(drive, { accounts }, version);
  return accounts.map(toPublicAccount);
}

/** OAuth 콜백에서 username 을 확정할 때 */
export async function resolveProfile(token: string, f: typeof fetch = fetch) {
  return getMe(token, f);
}
