import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockDriveClient } from "@/mocks/drive/MockDriveClient";
import { invalidateFolderCache, statusFolderId } from "@/lib/drive/paths";
import { readAiJobs, writeAccounts, writeAiJobs } from "@/lib/drive/system-files";

let drive: MockDriveClient;
vi.mock("@/lib/drive", async (orig) => ({ ...(await orig<typeof import("@/lib/drive")>()), getDrive: async () => drive }));

import { AttachmentsGoneError, cancelJob, enqueueJob, getJob, listJobs, retryJob, STALE_AFTER_MS } from "@/lib/ai/jobs/queue";
import { resetRunnerForTests, whenIdle } from "@/lib/ai/jobs/runner";
import { setProviders, resetProviders } from "@/lib/ai/provider/registry";
import { AiError } from "@/lib/ai/provider/types";
import { MOCK_CAROUSEL, MockAiProvider } from "@/mocks/ai/MockAiProvider";
import { AccountSchema, type AiJobInput } from "@/types";
import { POST as postJob } from "@/app/api/ai/jobs/route";

const iso = "2026-10-21T03:00:00.000Z";
const account = AccountSchema.parse({
  key: "cafe.log", ig_user_id: "", username: "cafe.log", access_token_enc: "", token_expires_at: iso, last_refreshed_at: iso,
  name: "카페로그", drive_folder_id: "x", inbox_folder_id: "y", status: "unlinked",
});
const input = (over: Partial<Omit<AiJobInput, "attachment_count">> = {}) => ({ account_key: "cafe.log", brief: "봄 카페", format: "4:5" as const, ...over });
const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e])], "a.png", { type: "image/png" });

async function drafts(): Promise<string[]> {
  return (await drive.listChildren(await statusFolderId(drive, "cafe.log", "draft"))).map((f) => f.name);
}
async function tmpJobFolders(): Promise<string[]> {
  const tmp = await drive.ensureFolder(drive.rootFolderId(), ["_system", "ai-tmp"]);
  return (await drive.listChildren(tmp.id)).map((f) => f.name);
}

beforeEach(async () => {
  invalidateFolderCache();
  resetProviders();
  resetRunnerForTests();
  drive = new MockDriveClient(MockDriveClient.createEmpty());
  await writeAccounts(drive, { accounts: [account] });
  setProviders([new MockAiProvider({ replies: () => MOCK_CAROUSEL })]);
});

describe("ai jobs", () => {
  it("runs a queued job to done and records the post, stage and call count", async () => {
    const job = await enqueueJob(input(), []);
    expect(job.status).toBe("queued");
    await whenIdle();
    const done = await getJob(job.id);
    expect(done.status).toBe("done");
    expect(done.stage).toBe("save");
    expect(done.calls).toBe(1);
    expect(await drafts()).toEqual([done.post_id]);
  });

  it("runs one job at a time, in arrival order", async () => {
    let inflight = 0;
    let peak = 0;
    const order: string[] = [];
    setProviders([
      new MockAiProvider({
        replies: async (req) => {
          inflight++;
          peak = Math.max(peak, inflight);
          order.push(req.user.match(/지침:\n(\S+)/)![1]!);
          await new Promise((r) => setTimeout(r, 5));
          inflight--;
          return MOCK_CAROUSEL;
        },
      }),
    ]);
    const jobs = await Promise.all(["첫째", "둘째", "셋째"].map((brief, i) => new Promise<Awaited<ReturnType<typeof enqueueJob>>>((r) => setTimeout(() => r(enqueueJob(input({ brief }), [])), i * 2))));
    await whenIdle();
    expect(peak).toBe(1);
    expect(order).toEqual(["첫째", "둘째", "셋째"]);
    expect((await listJobs()).every((j) => j.status === "done")).toBe(true);
    expect(jobs).toHaveLength(3);
  });

  it("fails with the auth kind and the failing stage when the login is gone", async () => {
    setProviders([new MockAiProvider({ replies: [new AiError("auth", "로그인이 만료됐어요")] })]);
    const job = await enqueueJob(input(), []);
    await whenIdle();
    const failed = await getJob(job.id);
    expect(failed.status).toBe("failed");
    expect(failed.error).toMatchObject({ kind: "auth", stage: "copy" });
    expect(await drafts()).toEqual([]);
  });

  it("marks a running job whose heartbeat stopped as interrupted when listing", async () => {
    const old = new Date(Date.now() - STALE_AFTER_MS - 1000).toISOString();
    await writeAiJobs(drive, { jobs: [{ id: "job-old", status: "running", stage: "copy", calls: 1, owner: "runner-dead", heartbeat_at: old, input: { ...input(), attachment_count: 0 }, created_at: old, updated_at: old }] });
    const jobs = await listJobs();
    expect(jobs[0]).toMatchObject({ id: "job-old", status: "failed", error: { kind: "interrupted", stage: "copy" } });
  });

  it("cancels a running job before saving and cleans its attachments", async () => {
    setProviders([
      new MockAiProvider({
        replies: async () => {
          const [running] = (await readAiJobs(drive)).data.jobs;
          void cancelJob(running!.id);
          return MOCK_CAROUSEL;
        },
      }),
    ]);
    const job = await enqueueJob(input(), [png()]);
    await whenIdle();
    expect((await getJob(job.id)).status).toBe("canceled");
    expect(await drafts()).toEqual([]);
    expect(await tmpJobFolders()).toEqual([]);
  });

  it("a cancel that lands right after the runner claimed the job stops it before any AI call", async () => {
    let calls = 0;
    setProviders([new MockAiProvider({ replies: () => { calls++; return MOCK_CAROUSEL; } })]);
    // 러너가 작업을 running 으로 쓰는 바로 그 순간(컨트롤러가 아직 등록되기 전)에 취소를 건다
    const write = drive.writeText.bind(drive);
    let fired = false;
    drive.writeText = async (folderId, name, text, mime) => {
      const res = await write(folderId, name, text, mime);
      if (!fired && name === "ai-jobs.json") {
        const running = (JSON.parse(text) as { jobs: { id: string; status: string }[] }).jobs.find((j) => j.status === "running");
        if (running) {
          fired = true;
          void cancelJob(running.id);
        }
      }
      return res;
    };
    const job = await enqueueJob(input(), [png()]);
    await whenIdle();
    expect(fired).toBe(true);
    expect((await getJob(job.id)).status).toBe("canceled");
    expect(calls).toBe(0);
    expect(await drafts()).toEqual([]);
    expect(await tmpJobFolders()).toEqual([]);
  });

  it("keeps one job-file lock across module reloads (Next reloads modules when .env.local changes)", async () => {
    // Drive 읽기를 살짝 늦춰 읽기-쓰기 사이에 다른 갱신이 끼어들 틈을 만든다
    const find = drive.findChild.bind(drive);
    drive.findChild = async (folderId, name) => {
      const f = await find(folderId, name);
      await new Promise((r) => setTimeout(r, 1));
      return f;
    };
    vi.resetModules();
    const a = await import("@/lib/ai/jobs/store");
    vi.resetModules();
    const b = await import("@/lib/ai/jobs/store");
    const mk = (i: number) => ({ id: `job-r${i}`, status: "done" as const, stage: "save" as const, calls: 0, input: { ...input(), attachment_count: 0 }, created_at: iso, updated_at: iso });
    await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? a : b).updateJobs(drive, (jobs) => ({ jobs: [...jobs, mk(i)], result: undefined }))));
    expect((await readAiJobs(drive)).data.jobs).toHaveLength(12);
  });

  it("cancels a queued job without running it", async () => {
    let releaseFirst!: () => void;
    const gate = new Promise<void>((r) => (releaseFirst = r));
    setProviders([new MockAiProvider({ replies: async () => { await gate; return MOCK_CAROUSEL; } })]);
    const first = await enqueueJob(input({ brief: "먼저" }), []);
    const second = await enqueueJob(input({ brief: "나중" }), []);
    expect((await cancelJob(second.id)).status).toBe("canceled");
    releaseFirst();
    await whenIdle();
    expect((await getJob(first.id)).status).toBe("done");
    expect((await getJob(second.id)).status).toBe("canceled");
    expect(await drafts()).toHaveLength(1);
  });

  it("fails with not_found when the account does not exist", async () => {
    const job = await enqueueJob(input({ account_key: "ghost" }), []);
    await whenIdle();
    expect((await getJob(job.id)).error).toMatchObject({ kind: "not_found" });
  });

  it("retries as a new job and keeps the original; jobs that had attachments cannot be retried", async () => {
    setProviders([new MockAiProvider({ replies: [new AiError("quota", "한도 초과"), MOCK_CAROUSEL] })]);
    const failed = await enqueueJob(input(), []);
    await whenIdle();
    expect((await getJob(failed.id)).error?.kind).toBe("quota");
    const again = await retryJob(failed.id);
    expect(again.id).not.toBe(failed.id);
    await whenIdle();
    expect((await getJob(again.id)).status).toBe("done");
    expect((await getJob(failed.id)).status).toBe("failed");

    setProviders([new MockAiProvider({ replies: [new AiError("auth", "x")] })]);
    const withFiles = await enqueueJob(input(), [png()]);
    await whenIdle();
    await expect(retryJob(withFiles.id)).rejects.toBeInstanceOf(AttachmentsGoneError);
  });

  it("leaves no temp attachment folder after done and failed jobs", async () => {
    await enqueueJob(input(), [png()]);
    setProviders([new MockAiProvider({ replies: [new AiError("auth", "x")] })]);
    await enqueueJob(input(), [png()]);
    await whenIdle();
    expect(await tmpJobFolders()).toEqual([]);
  });
});

describe("POST /api/ai/jobs", () => {
  const form = (meta: unknown, files: File[] = []) => {
    const f = new FormData();
    f.set("meta", JSON.stringify(meta));
    for (const file of files) f.append("files", file);
    return new Request("http://localhost/api/ai/jobs", { method: "POST", body: f });
  };

  it("creates a job and returns it without attachment bytes", async () => {
    const res = await postJob(form(input(), [png()]));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { job: { id: string; input: { attachment_count: number } } };
    expect(body.job.input.attachment_count).toBe(1);
    expect(JSON.stringify(body)).not.toMatch(/bytes|access|refresh/);
    await whenIdle();
  });

  it("answers 401 ai_not_connected when no provider is logged in", async () => {
    setProviders([new MockAiProvider({ connected: false })]);
    const res = await postJob(form(input()));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe("ai_not_connected");
  });

  it("rejects non-image attachments and invalid input", async () => {
    const txt = new File(["hi"], "a.txt", { type: "text/plain" });
    expect((await postJob(form(input(), [txt]))).status).toBe(400);
    expect((await postJob(form({ ...input(), slide_count: 2 }))).status).toBe(400);
  });
});
