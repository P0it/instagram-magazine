import "server-only";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isLocalDev, resetEnvCache } from "@/lib/env";
import { resetGoogleDrive } from "@/lib/drive";

/** .env.local 안의 KEY= 줄을 바꾸거나 없으면 끝에 붙인다 (순수 함수 — 테스트 대상) */
export function upsertEnvLine(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) return content.replace(re, line);
  const sep = content.length === 0 || content.endsWith("\n") ? "" : "\n";
  return `${content}${sep}${line}\n`;
}

/**
 * 로컬 개발에서만: 받은 refresh token 을 .env.local 에 쓰고 현재 프로세스에도 반영해
 * 복사·재시작 없이 바로 연결되게 한다. 배포 환경(Vercel)에는 쓸 수 있는 파일이 없으므로 false.
 */
export async function persistRefreshTokenLocally(token: string, file = path.join(process.cwd(), ".env.local")): Promise<boolean> {
  if (!isLocalDev()) return false;
  let content: string;
  try {
    content = await readFile(file, "utf8");
  } catch {
    return false;
  }
  await writeFile(file, upsertEnvLine(content, "GOOGLE_REFRESH_TOKEN", token), "utf8");
  process.env.GOOGLE_REFRESH_TOKEN = token;
  resetEnvCache();
  resetGoogleDrive();
  const g = globalThis as typeof globalThis & { __magazineDeskGoogleIdentity?: unknown };
  g.__magazineDeskGoogleIdentity = undefined;
  return true;
}
