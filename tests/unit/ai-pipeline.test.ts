import { beforeEach, describe, expect, it } from "vitest";
import { MockDriveClient } from "@/mocks/drive/MockDriveClient";
import { invalidateFolderCache, referenceFolderId, statusFolderId } from "@/lib/drive/paths";
import { writeAccounts, writeReferences } from "@/lib/drive/system-files";
import { CanceledError, runGeneration, type PipelineHooks } from "@/lib/ai/generate/pipeline";
import { MOCK_ANALYSIS, MOCK_CAROUSEL, MockAiProvider } from "@/mocks/ai/MockAiProvider";
import { AccountSchema, GeneratedCarouselSchema, PostMetadataSchema, type AiJobInput, type AiJobStage } from "@/types";

const iso = "2026-10-21T03:00:00.000Z";
const account = AccountSchema.parse({
  key: "cafe.log", ig_user_id: "", username: "cafe.log", access_token_enc: "", token_expires_at: iso, last_refreshed_at: iso,
  name: "카페로그", drive_folder_id: "x", inbox_folder_id: "y", status: "unlinked",
});
const good = GeneratedCarouselSchema.parse(MOCK_CAROUSEL);
const withCover = (text: string) => ({ ...good, slides: [{ ...good.slides[0]!, text }, ...good.slides.slice(1)] });
const bad = withCover("가".repeat(60));
const input = (over: Partial<AiJobInput> = {}): AiJobInput => ({ account_key: "cafe.log", brief: "봄 카페 3곳", format: "4:5", attachment_count: 0, ...over });

let drive: MockDriveClient;
let stages: AiJobStage[];
let calls: number;
const hooks = (extra: Partial<PipelineHooks> = {}): PipelineHooks => ({
  onStage: async (s) => void stages.push(s),
  onCall: async () => void calls++,
  ...extra,
});

async function drafts(): Promise<string[]> {
  const folder = await statusFolderId(drive, "cafe.log", "draft");
  return (await drive.listChildren(folder)).map((f) => f.name);
}
async function readMeta(postId: string) {
  const folder = await statusFolderId(drive, "cafe.log", "draft");
  const post = await drive.findChild(folder, postId);
  const f = await drive.findChild(post!.id, "metadata.json");
  return PostMetadataSchema.parse(JSON.parse(await drive.readText(f!.id)));
}

beforeEach(async () => {
  invalidateFolderCache();
  stages = [];
  calls = 0;
  drive = new MockDriveClient(MockDriveClient.createEmpty());
  await writeAccounts(drive, { accounts: [account] });
});

async function addReference(images = 1): Promise<string> {
  const id = "ref-cafe";
  const folder = await referenceFolderId(drive, id);
  const files = [];
  for (let i = 0; i < images; i++) {
    const f = await drive.uploadBytes(folder, `${i + 1}.png`, new Uint8Array([0x89, 0x50, i]), "image/png");
    files.push({ name: f.name, fileId: f.id });
  }
  await writeReferences(drive, { references: [{ id, title: "성수 카페 피드", kind: "feed", account: "x", url: "", tags: ["카페"], note: "여백이 좋음", palette: [], images: files, created_at: iso, updated_at: iso }] });
  return id;
}

describe("runGeneration", () => {
  it("saves a draft after one copy call and reports the stages in order", async () => {
    const provider = new MockAiProvider({ replies: [good] });
    const { postId } = await runGeneration(input(), [], hooks(), { provider, drive });
    expect(provider.calls).toHaveLength(1);
    expect(calls).toBe(1);
    expect(stages).toEqual(["copy", "layout", "review", "save"]);
    expect(await drafts()).toEqual([postId]);
    const meta = await readMeta(postId);
    expect(meta.status).toBe("draft");
    expect(meta.generation).toMatchObject({ provider: "claude", brief: "봄 카페 3곳" });
    expect(meta.warnings).toEqual([]);
  });

  it("asks the model to repair a spec violation and saves the fixed result", async () => {
    const provider = new MockAiProvider({ replies: [bad, good] });
    const { postId } = await runGeneration(input(), [], hooks(), { provider, drive });
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[1]!.user).toContain("1번째 슬라이드");
    expect((await readMeta(postId)).headline).toBe(good.headline);
    expect((await readMeta(postId)).warnings).toEqual([]);
  });

  it("saves with warnings after two failed repairs instead of failing the job", async () => {
    const provider = new MockAiProvider({ replies: [bad, bad, bad] });
    const { postId } = await runGeneration(input(), [], hooks(), { provider, drive });
    expect(provider.calls).toHaveLength(3);
    const meta = await readMeta(postId);
    expect(meta.status).toBe("draft");
    expect(meta.warnings.join(" ")).toContain("1번째 슬라이드");
  });

  it("counts an unparseable reply (unknown preset id) as one repair", async () => {
    const unknownPreset = { ...good, slides: [{ ...good.slides[0]!, preset: "nope" }, ...good.slides.slice(1)] };
    const provider = new MockAiProvider({ replies: [unknownPreset, good] });
    await runGeneration(input(), [], hooks(), { provider, drive });
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[1]!.user).toContain("스키마");
  });

  it("fails with invalid_output when the reply stays unparseable", async () => {
    const unknownPreset = { ...good, slides: [{ ...good.slides[0]!, preset: "nope" }] };
    const provider = new MockAiProvider({ replies: [unknownPreset, unknownPreset, unknownPreset] });
    await expect(runGeneration(input(), [], hooks(), { provider, drive })).rejects.toMatchObject({ kind: "invalid_output" });
    expect(await drafts()).toEqual([]);
  });

  it("repairs a wrong slide count when the job asked for a specific one", async () => {
    const five = { ...good, slides: [good.slides[0]!, good.slides[1]!, good.slides[1]!, good.slides[1]!, good.slides[2]!] };
    const provider = new MockAiProvider({ replies: [good, five] });
    const { postId } = await runGeneration(input({ slide_count: 5 }), [], hooks(), { provider, drive });
    expect(provider.calls[1]!.user).toContain("5장");
    expect((await readMeta(postId)).slides).toHaveLength(5);
  });

  it("skips the analyze step for a provider that cannot read images", async () => {
    const refId = await addReference(2);
    const provider = new MockAiProvider({ supportsImages: false, replies: [good] });
    await runGeneration(input({ reference_id: refId }), [], hooks(), { provider, drive });
    expect(stages[0]).toBe("copy");
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]!.user).toContain("성수 카페 피드");
  });

  it("analyzes the reference images first when the provider can read them", async () => {
    const refId = await addReference(2);
    const provider = new MockAiProvider({ replies: [MOCK_ANALYSIS, good] });
    await runGeneration(input({ reference_id: refId }), [], hooks(), { provider, drive });
    expect(stages).toEqual(["analyze", "copy", "layout", "review", "save"]);
    expect(provider.calls[0]!.images).toBe(2);
    expect(provider.calls[1]!.user).toContain("숫자로 시작");
  });

  it("stops before saving when the signal aborts", async () => {
    const ac = new AbortController();
    const provider = new MockAiProvider({ replies: [good] });
    const run = runGeneration(input(), [], hooks({ signal: ac.signal, onStage: async (s) => { stages.push(s); if (s === "review") ac.abort(); } }), { provider, drive });
    await expect(run).rejects.toBeInstanceOf(CanceledError);
    expect(await drafts()).toEqual([]);
  });

  it("fails with not_found for a missing reference or account", async () => {
    const provider = new MockAiProvider({ replies: [good] });
    await expect(runGeneration(input({ reference_id: "ref-missing" }), [], hooks(), { provider, drive })).rejects.toMatchObject({ kind: "not_found" });
    await expect(runGeneration(input({ account_key: "ghost" }), [], hooks(), { provider, drive })).rejects.toMatchObject({ kind: "not_found" });
    expect(provider.calls).toHaveLength(0);
  });
});
