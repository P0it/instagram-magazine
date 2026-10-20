import "server-only";
import {
  EditorStateSchema,
  PostMetadataSchema,
  SourcesFileSchema,
  VisualBriefSchema,
  formatDims,
  type Account,
  type EditorState,
  type GeneratedCarousel,
  type GenerationInfo,
  type PostFormat,
  type SlideDef,
} from "@/types";
import type { DriveClient } from "@/lib/drive/types";
import { slugify } from "@/lib/ingest/group";
import { createPostFolders, writePostFiles } from "@/lib/ingest/write-post";
import { getStylePack, resolvePreset } from "@/presets";
import { slideStateFromPreset } from "@/lib/render/layout";

export interface GeneratedAttachment {
  name: string;
  bytes: Uint8Array;
  mime: string;
}

export interface SaveOptions {
  format: PostFormat;
  generation: GenerationInfo;
  attachments: GeneratedAttachment[];
  warnings: string[];
  now?: Date;
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/**
 * 생성된 캐러셀을 /<account>/draft/<post>/ 에 저장한다. 상태는 항상 draft.
 * 슬라이드가 실제로 가리킨 첨부 이미지만 assets/ 로 복사한다.
 */
export async function saveGeneratedPost(
  drive: DriveClient,
  account: Account,
  carousel: GeneratedCarousel,
  opts: SaveOptions,
): Promise<{ postId: string; folderId: string }> {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const { height } = formatDims(opts.format);
  const stylePack = getStylePack(account.default_style_pack);

  const date = nowIso.slice(0, 10);
  const slug = slugify(carousel.topic || carousel.headline || "untitled");
  const { postId, folder, assets } = await createPostFolders(drive, account.key, `${date}_${slug}`);

  // 슬라이드가 쓴 첨부만 순서대로 source_0N 으로 복사 (같은 첨부를 두 번 쓰면 같은 파일)
  const assetByAttachment = new Map<number, string>();
  const assetFor = async (index: number): Promise<string | null> => {
    const hit = assetByAttachment.get(index);
    if (hit) return hit;
    const file = opts.attachments[index];
    if (!file) return null;
    const name = `source_${String(assetByAttachment.size + 1).padStart(2, "0")}.${EXT[file.mime] ?? "png"}`;
    await drive.uploadBytes(assets.id, name, file.bytes, file.mime);
    assetByAttachment.set(index, name);
    return name;
  };

  const slides: SlideDef[] = [];
  const editorSlides: EditorState["slides"] = {};
  for (const [i, s] of carousel.slides.entries()) {
    const id = `s${i + 1}`;
    const asset = s.attachment === undefined ? null : await assetFor(s.attachment);
    slides.push({ id, role: s.role, text: s.text, asset, style_preset: s.preset, ...(s.overrides ? { overrides: s.overrides } : {}) });
    editorSlides[id] = slideStateFromPreset(resolvePreset(s.preset, s.overrides, stylePack), s.text, height);
  }

  const metadata = PostMetadataSchema.parse({
    post_id: postId,
    channel: account.key,
    status: "draft",
    content_type: slides.length > 1 ? "carousel" : "single",
    format: opts.format,
    topic: carousel.topic,
    headline: carousel.headline,
    slides,
    caption: carousel.caption,
    hashtags: [...new Set(carousel.hashtags)],
    alt_text: carousel.alt_text,
    asset_mode: assetByAttachment.size > 0 ? "upload" : "text_only",
    fact_check_required: account.editorial_rules.fact_check_required,
    warnings: opts.warnings,
    generation: opts.generation,
    created_at: nowIso,
    updated_at: nowIso,
  });

  await writePostFiles(drive, folder.id, {
    metadata,
    sources: SourcesFileSchema.parse({ fact_check_status: "pending", items: [] }),
    visualBrief: VisualBriefSchema.parse({
      direction: stylePack?.description ?? "",
      palette: stylePack ? Object.values(stylePack.palette) : [],
      typography: stylePack?.typography.fontFamily ?? "sans",
      from_channel_default: true,
    }),
    editorState: EditorStateSchema.parse({ canvas: { width: 1080, height }, slides: editorSlides, updated_at: nowIso }),
  });

  return { postId, folderId: folder.id };
}
