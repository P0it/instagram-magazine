import "server-only";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isLocalDev, resetEnvCache } from "@/lib/env";
import { upsertEnvLine } from "@/lib/google/local-env";
import { AiError } from "./types";

export const defaultEnvFile = () => path.join(process.cwd(), ".env.local");

/**
 * AI 설정·토큰을 .env.local 한 줄로 쓴다. 파일이 없으면 만든다.
 * 로컬 개발이 아니면(배포 환경) 쓸 파일이 없으므로 auth 오류.
 * process.env 는 호출한 쪽이 성공 뒤에 바꾼다 (실패 시 메모리 상태가 파일과 어긋나지 않게).
 */
export async function writeEnvVar(key: string, value: string, file = defaultEnvFile()): Promise<void> {
  if (!isLocalDev()) throw new AiError("auth", "배포 환경에서는 AI 설정을 저장할 수 없어요");
  try {
    let content = "";
    try {
      content = await readFile(file, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    await writeFile(file, upsertEnvLine(content, key, value), "utf8");
  } catch (e) {
    throw new AiError("auth", `.env.local 에 저장하지 못했어요: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** 쓰기에 성공한 뒤 현재 프로세스에도 반영한다 */
export async function persistEnvVar(key: string, value: string, file = defaultEnvFile()): Promise<void> {
  await writeEnvVar(key, value, file);
  if (value) process.env[key] = value;
  else delete process.env[key];
  resetEnvCache();
}
