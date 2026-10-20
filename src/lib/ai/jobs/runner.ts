import "server-only";
import { randomUUID } from "node:crypto";
import { getDrive } from "@/lib/drive";
import type { DriveClient } from "@/lib/drive/types";
import { AiError } from "@/lib/ai/provider/types";
import { CanceledError, runGeneration } from "@/lib/ai/generate/pipeline";
import type { AiJob, AiJobStage } from "@/types";
import { loadAttachments, removeAttachments } from "./attachments";
import { HEARTBEAT_MS, updateJobs } from "./store";

/**
 * 작업 러너 — 한 번에 하나씩, 도착 순서대로. next dev 의 HMR 로 모듈이 다시 평가돼도
 * 러너가 둘이 되지 않도록 상태를 globalThis 에 둔다.
 */
interface RunnerState {
  owner: string;
  current: Promise<void> | null;
  controllers: Map<string, AbortController>;
}
const g = globalThis as typeof globalThis & { __magazineDeskAiRunner?: RunnerState };
const state = (): RunnerState => (g.__magazineDeskAiRunner ??= { owner: `runner-${randomUUID().slice(0, 8)}`, current: null, controllers: new Map() });

const now = () => new Date().toISOString();

/** 이 러너가 잡고 있는 running 작업만 고친다. 이미 취소·중단 처리된 작업을 덮어쓰지 않는다. */
function patchRunning(drive: DriveClient, id: string, fn: (j: AiJob) => AiJob): Promise<void> {
  return updateJobs(drive, (jobs) => {
    const i = jobs.findIndex((j) => j.id === id && j.status === "running" && j.owner === state().owner);
    if (i < 0) return { jobs, result: undefined };
    const next = jobs.slice();
    next[i] = { ...fn(jobs[i]!), updated_at: now() };
    return { jobs: next, result: undefined };
  });
}

/** 가장 오래된 queued 를 running 으로 바꿔 잡는다 */
function claimNext(drive: DriveClient): Promise<AiJob | null> {
  return updateJobs(drive, (jobs) => {
    const queued = jobs.filter((j) => j.status === "queued").sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    if (!queued) return { jobs, result: null };
    const claimed: AiJob = { ...queued, status: "running", owner: state().owner, heartbeat_at: now(), updated_at: now() };
    return { jobs: jobs.map((j) => (j.id === queued.id ? claimed : j)), result: claimed };
  });
}

async function runOne(drive: DriveClient, job: AiJob): Promise<void> {
  const ac = new AbortController();
  state().controllers.set(job.id, ac);
  const heartbeat = setInterval(() => void patchRunning(drive, job.id, (j) => ({ ...j, heartbeat_at: now() })).catch(() => undefined), HEARTBEAT_MS);
  heartbeat.unref?.();
  let stage: AiJobStage = job.stage;
  try {
    const attachments = await loadAttachments(drive, job.id);
    const { postId } = await runGeneration(
      job.input,
      attachments,
      {
        signal: ac.signal,
        onStage: async (s) => {
          stage = s;
          await patchRunning(drive, job.id, (j) => ({ ...j, stage: s }));
        },
        onCall: () => patchRunning(drive, job.id, (j) => ({ ...j, calls: j.calls + 1 })),
      },
      { drive },
    );
    await patchRunning(drive, job.id, (j) => ({ ...j, status: "done", stage: "save", post_id: postId, error: undefined }));
  } catch (e) {
    if (e instanceof CanceledError || ac.signal.aborted) {
      await patchRunning(drive, job.id, (j) => ({ ...j, status: "canceled" }));
    } else {
      const kind = e instanceof AiError ? e.kind : "internal";
      const message = e instanceof Error ? e.message : String(e);
      if (kind === "internal") console.error(`[ai-jobs] ${job.id} failed:`, e);
      await patchRunning(drive, job.id, (j) => ({ ...j, status: "failed", error: { stage, kind, message } }));
    }
  } finally {
    clearInterval(heartbeat);
    state().controllers.delete(job.id);
    await removeAttachments(drive, job.id);
  }
}

async function loop(): Promise<void> {
  const drive = await getDrive();
  for (;;) {
    let job: AiJob | null;
    try {
      job = await claimNext(drive);
    } catch (e) {
      console.error("[ai-jobs] could not claim the next job:", e);
      return;
    }
    if (!job) return;
    await runOne(drive, job);
  }
}

/** 러너를 깨운다. 이미 돌고 있으면 무시한다. */
export function kickRunner(): void {
  const s = state();
  if (s.current) return;
  s.current = loop().finally(() => {
    s.current = null;
  });
}

export function isRunnerActive(): boolean {
  return state().current !== null;
}

/** 이 프로세스에서 돌고 있는 작업이면 취소 신호를 보낸다 (동기) */
export function abortRunning(jobId: string): boolean {
  const ac = state().controllers.get(jobId);
  if (!ac) return false;
  ac.abort();
  return true;
}

/** 러너가 쉴 때까지 기다린다 (테스트·종료용) */
export async function whenIdle(): Promise<void> {
  while (state().current) await state().current;
}

export function resetRunnerForTests(): void {
  const s = state();
  s.current = null;
  s.controllers.clear();
}
