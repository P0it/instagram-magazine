import "server-only";
import { PublicAccountSchema, type AccountStatus, type InstagramAccount, type PublicAccount } from "@/types";
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

export function toPublicAccount(a: InstagramAccount): PublicAccount {
  return PublicAccountSchema.parse({ ...a, status: a.status === "error" ? "error" : computeStatus(a.token_expires_at) });
}

export async function listPublicAccounts(drive: DriveClient): Promise<PublicAccount[]> {
  const { data } = await readAccounts(drive);
  return data.accounts.map(toPublicAccount);
}

export async function getAccount(drive: DriveClient, key: string): Promise<InstagramAccount | null> {
  const { data } = await readAccounts(drive);
  return data.accounts.find((a) => a.key === key) ?? null;
}

/** 복호화된 토큰. 서버 안에서만 쓴다 — 절대 응답에 넣지 않는다. */
export function accessTokenOf(account: InstagramAccount): string {
  return decryptString(account.access_token_enc, encryptionKey());
}

export async function upsertAccount(
  drive: DriveClient,
  input: { key: string; ig_user_id: string; username: string; access_token: string; expires_in_seconds: number },
): Promise<PublicAccount> {
  const now = new Date();
  const account: InstagramAccount = {
    key: input.key,
    ig_user_id: input.ig_user_id,
    username: input.username,
    access_token_enc: encryptString(input.access_token, encryptionKey()),
    token_expires_at: new Date(now.getTime() + input.expires_in_seconds * 1000).toISOString(),
    last_refreshed_at: now.toISOString(),
    status: "connected",
  };
  const { data, version } = await readAccounts(drive);
  const accounts = data.accounts.filter((a) => a.key !== account.key);
  accounts.push(account);
  await writeAccounts(drive, { accounts }, version);
  return toPublicAccount(account);
}

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
    data.accounts.map(async (a): Promise<InstagramAccount> => {
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
