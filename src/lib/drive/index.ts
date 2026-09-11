import "server-only";
import { env } from "@/lib/env";
import { GoogleDriveClient } from "./GoogleDriveClient";
import { MockDriveClient, type MockTree } from "@/mocks/drive/MockDriveClient";
import { seedMockTree } from "@/mocks/seed";
import type { DriveClient } from "./types";

export type { DriveClient, DriveFile } from "./types";
export { DriveNotFoundError, FOLDER_MIME, isFolder, guessMime, isImageMime } from "./types";

interface GlobalDriveState {
  mockTree?: MockTree;
  mockSeeded?: Promise<void>;
  google?: GoogleDriveClient;
}

const g = globalThis as typeof globalThis & { __magazineDesk?: GlobalDriveState };
const state: GlobalDriveState = (g.__magazineDesk ??= {});

/** 서버 전용. DRIVE_CLIENT=google 이고 자격증명이 있으면 Google, 아니면 Mock. */
export async function getDrive(): Promise<DriveClient> {
  const e = env();
  if (e.DRIVE_CLIENT === "google") {
    state.google ??= new GoogleDriveClient(e.GOOGLE_SERVICE_ACCOUNT_JSON, e.GOOGLE_DRIVE_ROOT_FOLDER_ID);
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
