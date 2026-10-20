import "server-only";
import { readAiJobs, VersionConflictError, writeAiJobs } from "@/lib/drive/system-files";
import type { DriveClient } from "@/lib/drive/types";
import { globalState } from "@/lib/ai/global-state";
import type { AiJob } from "@/types";

export const HEARTBEAT_MS = 15_000;
/** running 인데 heartbeat 가 이만큼 멈췄으면 중단된 작업으로 본다 */
export const STALE_AFTER_MS = 120_000;
const KEEP_JOBS = 100;
const MAX_ATTEMPTS = 8;

const TERMINAL = new Set<AiJob["status"]>(["done", "failed", "canceled"]);
export const isTerminal = (j: Pick<AiJob, "status">): boolean => TERMINAL.has(j.status);

/** 오래된 끝난 작업부터 버려 최근 100건만 남긴다 */
function prune(jobs: AiJob[]): AiJob[] {
  if (jobs.length <= KEEP_JOBS) return jobs;
  const drop = new Set(
    jobs
      .filter(isTerminal)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, jobs.length - KEEP_JOBS)
      .map((j) => j.id),
  );
  return jobs.filter((j) => !drop.has(j.id));
}

const lock = globalState("jobsLock", () => ({ chain: Promise.resolve() as Promise<unknown> }));

/**
 * 읽기-수정-쓰기. 이 프로세스 안에서는 잠금으로 직렬화하고, Drive 쪽 버전 충돌은 다시 읽어 재시도한다.
 * fn 은 (현재 작업 목록) → { jobs: 새 목록, result } 를 돌려준다. 같은 목록 객체를 그대로 돌려주면 쓰지 않는다.
 */
export function updateJobs<T>(drive: DriveClient, fn: (jobs: AiJob[]) => { jobs: AiJob[]; result: T }): Promise<T> {
  const run = async (): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      const { data, version } = await readAiJobs(drive);
      const out = fn(data.jobs);
      if (out.jobs === data.jobs) return out.result;
      try {
        await writeAiJobs(drive, { jobs: prune(out.jobs) }, version);
        return out.result;
      } catch (e) {
        if (!(e instanceof VersionConflictError) || attempt >= MAX_ATTEMPTS) throw e;
      }
    }
  };
  const next = lock.chain.then(run, run);
  lock.chain = next.catch(() => undefined);
  return next;
}

export async function readJobs(drive: DriveClient): Promise<AiJob[]> {
  return (await readAiJobs(drive)).data.jobs;
}
