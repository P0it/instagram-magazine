import "server-only";
import { env, googleAuthMode } from "@/lib/env";
import { GoogleDriveClient, oauthAuth, resolveRootFolder, serviceAccountAuth, type GoogleAuth } from "./GoogleDriveClient";
import { MockDriveClient, type MockTree } from "@/mocks/drive/MockDriveClient";
import { seedMockTree } from "@/mocks/seed";
import type { DriveClient } from "./types";

export type { DriveClient, DriveFile } from "./types";
export { DriveNotFoundError, FOLDER_MIME, isFolder, guessMime, isImageMime } from "./types";

interface GlobalDriveState {
  mockTree?: MockTree;
  mockSeeded?: Promise<void>;
  google?: Promise<GoogleDriveClient>;
  warnedNoCreds?: boolean;
}

const g = globalThis as typeof globalThis & { __magazineDesk?: GlobalDriveState };
const state: GlobalDriveState = (g.__magazineDesk ??= {});

/** 현재 환경변수로 만든 Google 인증. 자격증명이 없으면 null. */
export function googleAuthFromEnv(): GoogleAuth | null {
  const e = env();
  switch (googleAuthMode(e)) {
    case "oauth":
      return oauthAuth({ clientId: e.GOOGLE_OAUTH_CLIENT_ID, clientSecret: e.GOOGLE_OAUTH_CLIENT_SECRET, refreshToken: e.GOOGLE_REFRESH_TOKEN });
    case "service_account":
      return serviceAccountAuth(e.GOOGLE_SERVICE_ACCOUNT_JSON);
    default:
      return null;
  }
}

async function createGoogleDrive(): Promise<GoogleDriveClient> {
  const e = env();
  const auth = googleAuthFromEnv();
  if (!auth) throw new Error("Google Drive 자격증명이 없습니다 (GOOGLE_REFRESH_TOKEN 또는 GOOGLE_SERVICE_ACCOUNT_JSON)");
  // 서비스 계정은 공유받은 폴더 id 가 필수, OAuth 는 없으면 "Instagram Magazine" 을 찾거나 만든다
  if (googleAuthMode(e) === "service_account" && !e.GOOGLE_DRIVE_ROOT_FOLDER_ID) throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID missing");
  const root = await resolveRootFolder(auth, e.GOOGLE_DRIVE_ROOT_FOLDER_ID);
  return new GoogleDriveClient(auth, root);
}

/** 서버 전용. DRIVE_CLIENT=google 이고 자격증명이 있으면 Google, 아니면 Mock. */
export async function getDrive(): Promise<DriveClient> {
  const e = env();
  if (e.DRIVE_CLIENT === "google" && googleAuthMode(e) === "none") {
    // 아직 Google 계정을 연결하지 않은 상태 — 앱이 죽지 않게 Mock 으로 동작하고 설정 화면이 "자격증명 없음" 을 보여준다
    if (!state.warnedNoCreds) {
      state.warnedNoCreds = true;
      console.warn("[drive] DRIVE_CLIENT=google 이지만 자격증명이 없어 Mock 으로 동작합니다. 설정 › Google Drive 에서 연결하세요.");
    }
  } else if (e.DRIVE_CLIENT === "google") {
    state.google ??= createGoogleDrive().catch((err) => {
      state.google = undefined; // 실패는 캐시하지 않는다
      throw err;
    });
    return state.google;
  }
  if (!state.mockTree) {
    state.mockTree = MockDriveClient.createEmpty();
    state.mockSeeded = seedMockTree(state.mockTree);
  }
  await state.mockSeeded;
  return new MockDriveClient(state.mockTree);
}

/** 테스트용: mock 트리 초기화 */
export function resetMockDrive(): void {
  state.mockTree = undefined;
  state.mockSeeded = undefined;
}
