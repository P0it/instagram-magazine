import { PostSaveRequestSchema, SourcesFileSchema, type PostBundle } from "@/types";
import { getDrive } from "@/lib/drive";
import {
  assertNotStale,
  loadPost,
  toBundle,
  writeEditorState,
  writeMetadata,
  writeSources,
} from "@/lib/metadata/post-repo";
import { upsertIndexEntry } from "@/lib/metadata/index-builder";
import { handle, json, readJsonBody } from "@/lib/api/respond";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/posts/[id] — metadata + sources + visual-brief + editor-state */
export async function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const drive = await getDrive();
    const post = await loadPost(drive, id);
    return json<PostBundle>(toBundle(post));
  });
}

/** PUT /api/posts/[id] — metadata/editor-state/sources 저장 (낙관적 락) */
export async function PUT(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = PostSaveRequestSchema.parse(await readJsonBody(req));
    const drive = await getDrive();
    const post = await loadPost(drive, id);
    assertNotStale(post.metadata, body.expected_updated_at);

    const now = new Date().toISOString();
    let metadata = post.metadata;
    // needs_repair 에서 저장하면 draft 로 (§6: 운영자 수정 저장)
    const wasRepair = metadata.status === "needs_repair";
    metadata = await writeMetadata(drive, post.folderId, {
      ...metadata,
      ...(body.metadata ?? {}),
      status: wasRepair ? "draft" : metadata.status,
      warnings: wasRepair ? [] : metadata.warnings,
      updated_at: now,
    });

    let editorState = post.editorState;
    if (body.editorState) {
      editorState = { ...body.editorState, updated_at: now };
      await writeEditorState(drive, post.folderId, editorState);
    }
    let sources = post.sources;
    if (body.sources) {
      sources = SourcesFileSchema.parse({ ...post.sources, ...body.sources });
      await writeSources(drive, post.folderId, sources);
    }

    const updated = { ...post, metadata, editorState, sources };
    await upsertIndexEntry(drive, updated);
    return json<PostBundle>(toBundle(updated));
  });
}
