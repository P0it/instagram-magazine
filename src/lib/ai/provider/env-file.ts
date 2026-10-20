import "server-only";
import { readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { isLocalDev, resetEnvCache } from "@/lib/env";
import { upsertEnvLine } from "@/lib/google/local-env";
import { globalState } from "@/lib/ai/global-state";
import { AiError } from "./types";

export const defaultEnvFile = () => path.join(process.cwd(), ".env.local");

/** .env.local 은 Google·접근 키 같은 다른 자격증명도 담고 있다 — 쓰기는 한 줄로 세워 서로 덮어쓰지 않게 한다 */
const lock = globalState("envFileLock", () => ({ chain: Promise.resolve() as Promise<unknown> }));

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.chain.then(fn, fn);
  lock.chain = run.catch(() => undefined);
  return run;
}

/**
 * AI 설정·토큰을 .env.local 한 줄로 쓴다. 파일이 없으면 만든다.
 * 임시 파일에 쓴 뒤 rename 해서 도중에 멈춰도 반쯤 쓰인 파일이 남지 않게 한다.
 * 로컬 개발이 아니면(배포 환경) 쓸 파일이 없으므로 auth 오류.
 */
export async function writeEnvVar(key: string, value: string, file = defaultEnvFile()): Promise<void> {
  if (!isLocalDev()) throw new AiError("auth", "배포 환경에서는 AI 설정을 저장할 수 없어요");
  return serialized(async () => {
    try {
      let content = "";
      try {
        content = await readFile(file, "utf8");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
      const mode = (await stat(file).catch(() => null))?.mode;
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, upsertEnvLine(content, key, value), { encoding: "utf8", mode: mode === undefined ? 0o600 : mode & 0o777 });
      await rename(tmp, file);
    } catch (e) {
      throw new AiError("auth", `.env.local 에 저장하지 못했어요: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
}

/** 쓰기에 성공한 뒤 현재 프로세스에도 반영한다 */
export async function persistEnvVar(key: string, value: string, file = defaultEnvFile()): Promise<void> {
  await writeEnvVar(key, value, file);
  if (value) process.env[key] = value;
  else delete process.env[key];
  resetEnvCache();
}
