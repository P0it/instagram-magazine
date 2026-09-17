import "server-only";
import type { GoogleDriveStatus } from "@/types";
import { env, googleAuthMode, googleRedirectUri, isGoogleOauthConfigured } from "@/lib/env";
import { getDrive, googleAuthFromEnv } from "@/lib/drive";
import { fetchDriveIdentity } from "@/lib/drive/GoogleDriveClient";

const g = globalThis as typeof globalThis & { __magazineDeskGoogleIdentity?: Promise<{ email: string | null }> };

/**
 * 설정 화면용 Google Drive 상태. Mock 이면 Drive 를 건드리지 않는다.
 * 연결 계정 이메일은 프로세스 안에서 한 번만 조회한다.
 */
export async function googleDriveStatus(): Promise<GoogleDriveStatus> {
  const e = env();
  const base = { oauth_configured: isGoogleOauthConfigured(), redirect_uri: googleRedirectUri(), root_folder_id: null, email: null, error: null };
  if (e.DRIVE_CLIENT !== "google") return { ...base, mode: "mock" };
  const mode = googleAuthMode(e);
  if (mode === "none") return { ...base, mode, error: "Google 자격증명이 없어 임시로 Mock 데이터로 동작 중이에요. 아래에서 연결하세요." };
  try {
    const drive = await getDrive();
    const auth = googleAuthFromEnv();
    g.__magazineDeskGoogleIdentity ??= auth ? fetchDriveIdentity(auth) : Promise.resolve({ email: null });
    const identity = await g.__magazineDeskGoogleIdentity.catch(() => {
      g.__magazineDeskGoogleIdentity = undefined;
      return { email: null };
    });
    return { ...base, mode, root_folder_id: drive.rootFolderId(), email: identity.email };
  } catch (err) {
    return { ...base, mode, error: err instanceof Error ? err.message : String(err) };
  }
}
