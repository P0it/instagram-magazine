import "server-only";
import type { z } from "zod";
import { getDrive } from "@/lib/drive";
import { AiJobInputSchema, type AiJob } from "@/types";
import { AttachmentsGoneError, JobNotFoundError, JobStateError } from "./errors";
import { removeAttachments, saveAttachments } from "./attachments";
import { abortRunning, isRunnerActive, kickRunner } from "./runner";
import { isTerminal, STALE_AFTER_MS, updateJobs } from "./store";

export { AttachmentsGoneError, JobNotFoundError, JobStateError } from "./errors";
export { HEARTBEAT_MS, STALE_AFTER_MS } from "./store";

export type AiJobRequest = Omit<z.input<typeof AiJobInputSchema>, "attachment_count">;

const newId = () => `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export async function enqueueJob(request: AiJobRequest, files: File[]): Promise<AiJob> {
  const drive = await getDrive();
  const input = AiJobInputSchema.parse({ ...request, attachment_count: files.length });
  const nowIso = new Date().toISOString();
  const job: AiJob = { id: newId(), status: "queued", stage: "analyze", input, calls: 0, created_at: nowIso, updated_at: nowIso };
  // 첨부를 먼저 두고 작업을 올린다 — 러너가 첨부 없는 작업을 보는 일이 없게
  await saveAttachments(drive, job.id, files);
  await updateJobs(drive, (jobs) => ({ jobs: [...jobs, job], result: undefined }));
  kickRunner();
  return job;
}

/** 목록을 읽을 때 heartbeat 가 멈춘 running 작업을 중단 처리한다 */
async function loadJobs(now = Date.now()): Promise<AiJob[]> {
  const drive = await getDrive();
  const { jobs, interrupted } = await updateJobs(drive, (all) => {
    const stale = all.filter((j) => j.status === "running" && now - Date.parse(j.heartbeat_at ?? j.updated_at) > STALE_AFTER_MS);
    if (stale.length === 0) return { jobs: all, result: { jobs: all, interrupted: [] as string[] } };
    const ids = new Set(stale.map((j) => j.id));
    const next = all.map((j): AiJob =>
      ids.has(j.id)
        ? { ...j, status: "failed", error: { stage: j.stage, kind: "interrupted", message: "앱이 멈추면서 작업이 중단됐어요. 다시 시도해 주세요." }, updated_at: new Date(now).toISOString() }
        : j,
    );
    return { jobs: next, result: { jobs: next, interrupted: [...ids] } };
  });
  for (const id of interrupted) await removeAttachments(drive, id);
  // 러너가 놓친 queued 작업이 있으면 다시 깨운다
  if (!isRunnerActive() && jobs.some((j) => j.status === "queued")) kickRunner();
  return jobs;
}

/** 최신순 */
export async function listJobs(now = Date.now()): Promise<AiJob[]> {
  return (await loadJobs(now)).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getJob(id: string): Promise<AiJob> {
  const job = (await loadJobs()).find((j) => j.id === id);
  if (!job) throw new JobNotFoundError(id);
  return job;
}

/**
 * queued 는 바로 취소한다. running 은 취소 신호를 보내고, 러너가 다음 AI 호출 전에 반영한다.
 * 이 프로세스에 러너가 없는 running(중단된 작업)은 바로 canceled 로 둔다.
 */
export async function cancelJob(id: string): Promise<AiJob> {
  const aborted = abortRunning(id);
  const drive = await getDrive();
  const { job, cleanup } = await updateJobs(drive, (jobs) => {
    const i = jobs.findIndex((j) => j.id === id);
    if (i < 0) throw new JobNotFoundError(id);
    const cur = jobs[i]!;
    const cancelNow = cur.status === "queued" || (cur.status === "running" && !aborted);
    if (!cancelNow) return { jobs, result: { job: cur, cleanup: false } };
    const next = jobs.slice();
    next[i] = { ...cur, status: "canceled", updated_at: new Date().toISOString() };
    return { jobs: next, result: { job: next[i]!, cleanup: true } };
  });
  if (cleanup) await removeAttachments(drive, id);
  return job;
}

/** 끝난(failed·canceled) 작업의 입력으로 새 작업을 만든다. 원본은 그대로 둔다. */
export async function retryJob(id: string): Promise<AiJob> {
  const original = await getJob(id);
  if (!isTerminal(original) || original.status === "done") throw new JobStateError("실패하거나 취소된 작업만 다시 시도할 수 있어요");
  if (original.input.attachment_count > 0) throw new AttachmentsGoneError();
  const { attachment_count: _count, ...request } = original.input;
  void _count;
  return enqueueJob(request, []);
}
