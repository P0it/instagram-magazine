import "server-only";
import type { z } from "zod";
import {
  AccountsFileSchema,
  CustomPresetsFileSchema,
  IndexFileSchema,
  IngestLogFileSchema,
  type AccountsFile,
  type CustomPresetsFile,
  type IndexFile,
  type IngestLogFile,
} from "@/types";
import type { DriveClient } from "./types";
import { systemFolderId } from "./paths";

export class VersionConflictError extends Error {
  constructor(name: string) {
    super(`Version conflict while writing ${name}`);
    this.name = "VersionConflictError";
  }
}

export interface SystemJson<T> {
  data: T;
  version: string | null;
  fileId: string | null;
}

/** _system/<name> 을 Zod 로 읽는다. 없거나 깨졌으면 fallback. */
export async function readSystemJson<S extends z.ZodTypeAny>(
  drive: DriveClient,
  name: string,
  schema: S,
  fallback: z.input<S>,
): Promise<SystemJson<z.output<S>>> {
  const folder = await systemFolderId(drive);
  const f = await drive.findChild(folder, name);
  if (!f) return { data: schema.parse(fallback), version: null, fileId: null };
  try {
    const text = await drive.readText(f.id);
    const parsed = schema.safeParse(JSON.parse(text));
    if (parsed.success) return { data: parsed.data, version: f.version, fileId: f.id };
    console.warn(`[system-files] ${name} invalid, using fallback:`, parsed.error.issues.slice(0, 3));
    return { data: schema.parse(fallback), version: f.version, fileId: f.id };
  } catch (e) {
    console.warn(`[system-files] ${name} unreadable:`, e);
    return { data: schema.parse(fallback), version: f.version, fileId: f.id };
  }
}

/**
 * 읽기-수정-쓰기. expectedVersion 을 넘기면 Drive 의 현재 version 과 비교해 다르면 충돌.
 */
export async function writeSystemJson<T>(
  drive: DriveClient,
  name: string,
  data: T,
  expectedVersion?: string | null,
): Promise<void> {
  const folder = await systemFolderId(drive);
  if (expectedVersion !== undefined) {
    const current = await drive.findChild(folder, name);
    const currentVersion = current?.version ?? null;
    if (currentVersion !== expectedVersion) throw new VersionConflictError(name);
  }
  await drive.writeText(folder, name, JSON.stringify(data, null, 2), "application/json");
}

export const readAccounts = (drive: DriveClient) =>
  readSystemJson(drive, "accounts.json", AccountsFileSchema, { accounts: [] });
export const writeAccounts = (drive: DriveClient, data: AccountsFile, v?: string | null) =>
  writeSystemJson(drive, "accounts.json", data, v);

export const readIndexFile = (drive: DriveClient) =>
  readSystemJson(drive, "index.json", IndexFileSchema, { generated_at: new Date(0).toISOString(), posts: [] });
export const writeIndexFile = (drive: DriveClient, data: IndexFile) => writeSystemJson(drive, "index.json", data);

export const readCustomPresets = (drive: DriveClient) =>
  readSystemJson(drive, "custom-presets.json", CustomPresetsFileSchema, { presets: [] });
export const writeCustomPresets = (drive: DriveClient, data: CustomPresetsFile, v?: string | null) =>
  writeSystemJson(drive, "custom-presets.json", data, v);

export const readIngestLog = (drive: DriveClient) =>
  readSystemJson(drive, "ingest-log.json", IngestLogFileSchema, { last_sync_at: null, entries: [] });
export const writeIngestLog = (drive: DriveClient, data: IngestLogFile, v?: string | null) =>
  writeSystemJson(drive, "ingest-log.json", data, v);
