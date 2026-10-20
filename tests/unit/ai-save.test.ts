import { beforeEach, describe, expect, it } from "vitest";
import { MockDriveClient } from "@/mocks/drive/MockDriveClient";
import { invalidateFolderCache, statusFolderId } from "@/lib/drive/paths";
import { readIndexFile } from "@/lib/drive/system-files";
import { saveGeneratedPost } from "@/lib/ai/generate/save";
import { MOCK_CAROUSEL } from "@/mocks/ai/MockAiProvider";
import { AccountSchema, EditorStateSchema, GeneratedCarouselSchema, PostMetadataSchema, type GenerationInfo } from "@/types";

const NOW = new Date("2026-10-21T03:00:00.000Z");
const iso = NOW.toISOString();
const account = AccountSchema.parse({
  key: "cafe.log", ig_user_id: "", username: "cafe.log", access_token_enc: "", token_expires_at: iso, last_refreshed_at: iso,
  name: "카페로그", drive_folder_id: "x", inbox_folder_id: "y", status: "unlinked", default_hashtags: ["기본태그"],
});
const generation: GenerationInfo = { brief: "봄 카페", provider: "claude", spec_version: "test", generated_at: iso };
const png = (n: number) => ({ name: `a${n}.png`, bytes: new Uint8Array([0x89, 0x50, n]), mime: "image/png" });

let drive: MockDriveClient;
beforeEach(() => {
  invalidateFolderCache();
  drive = new MockDriveClient(MockDriveClient.createEmpty());
});

async function readJson(folderId: string, name: string): Promise<unknown> {
  const f = await drive.findChild(folderId, name);
  return JSON.parse(await drive.readText(f!.id));
}

describe("saveGeneratedPost", () => {
  const carousel = GeneratedCarouselSchema.parse(MOCK_CAROUSEL);
  const base = { format: "4:5" as const, generation, attachments: [], warnings: [], now: NOW };

  it("writes a draft post whose metadata carries the generation info", async () => {
    const { postId, folderId } = await saveGeneratedPost(drive, account, carousel, base);
    const draft = await statusFolderId(drive, account.key, "draft");
    expect((await drive.findChild(draft, postId))?.id).toBe(folderId);
    const meta = PostMetadataSchema.parse(await readJson(folderId, "metadata.json"));
    expect(meta.status).toBe("draft");
    expect(meta.channel).toBe("cafe.log");
    expect(meta.generation?.provider).toBe("claude");
    expect(meta.slides.map((s) => s.style_preset)).toEqual(["cover-center", "info-dark", "closing-slide"]);
    expect(meta.asset_mode).toBe("text_only");
    // AI 가 낸 해시태그만 쓰고 계정 기본 태그를 섞지 않는다
    expect(meta.hashtags).toEqual(["카페", "서울카페", "주말"]);
  });

  it("copies only the attachments that slides actually use", async () => {
    const withImage = { ...carousel, slides: carousel.slides.map((s, i) => (i === 0 ? { ...s, attachment: 1 } : s)) };
    const { folderId } = await saveGeneratedPost(drive, account, withImage, { ...base, attachments: [png(1), png(2), png(3)] });
    const assets = await drive.findChild(folderId, "assets");
    const files = await drive.listChildren(assets!.id);
    expect(files.map((f) => f.name)).toEqual(["source_01.png"]);
    const meta = PostMetadataSchema.parse(await readJson(folderId, "metadata.json"));
    expect(meta.slides[0]!.asset).toBe("source_01.png");
    expect(meta.asset_mode).toBe("upload");
  });

  it("suffixes the folder name when the same topic is saved twice on one day", async () => {
    const a = await saveGeneratedPost(drive, account, carousel, base);
    const b = await saveGeneratedPost(drive, account, carousel, base);
    expect(b.postId).toBe(`${a.postId}-2`);
  });

  it("sizes the editor canvas to the post format", async () => {
    const { folderId } = await saveGeneratedPost(drive, account, carousel, { ...base, format: "3:4" });
    const state = EditorStateSchema.parse(await readJson(folderId, "editor-state.json"));
    expect(state.canvas.height).toBe(1440);
    expect(PostMetadataSchema.parse(await readJson(folderId, "metadata.json")).format).toBe("3:4");
  });

  it("adds the post to index.json so the home board lists it", async () => {
    const { postId } = await saveGeneratedPost(drive, account, carousel, base);
    const index = (await readIndexFile(drive)).data;
    expect(index.posts.map((p) => p.post_id)).toContain(postId);
    expect(index.posts.find((p) => p.post_id === postId)).toMatchObject({ channel: "cafe.log", status: "draft", headline: carousel.headline, slide_count: 3 });
  });

  it("records spec warnings on the post", async () => {
    const { folderId } = await saveGeneratedPost(drive, account, carousel, { ...base, warnings: ["1번째 슬라이드 글이 넘쳐요"] });
    expect(PostMetadataSchema.parse(await readJson(folderId, "metadata.json")).warnings).toEqual(["1번째 슬라이드 글이 넘쳐요"]);
  });
});
