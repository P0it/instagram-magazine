import "server-only";
import {
  EditorStateSchema,
  PostMetadataSchema,
  SourcesFileSchema,
  VisualBriefSchema,
  type ChannelConfig,
  type ChannelKey,
  type EditorState,
  type InboxGroup,
  type PostMetadata,
  type SlideDef,
} from "@/types";
import type { DriveClient } from "@/lib/drive/types";
import { statusFolderId } from "@/lib/drive/paths";
import { defaultPresetForRole, getStylePack, resolvePreset, CHANNEL_DEFAULT_STYLE_PACK } from "@/presets";
import { slideStateFromPreset } from "@/lib/render/layout";
import { parseInboxMarkdown } from "./parse-md";
import { slugify } from "./group";

export interface NormalizeResult {
  postId: string;
  folderId: string;
  status: "draft" | "needs_repair";
  problems: string[];
}

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "png";
}

/**
 * inbox 그룹 하나 → /<CH>/draft/<post-folder>/ canonical 구조.
 * 실패/필수값 누락이면 status: needs_repair 로 생성하고 problems 를 warnings 에 남긴다.
 */
export async function normalizeGroup(
  drive: DriveClient,
  channel: ChannelKey,
  channelConfig: ChannelConfig | undefined,
  group: InboxGroup,
  inboxFolderId: string,
  now = new Date(),
): Promise<NormalizeResult> {
  const problems: string[] = [];
  const nowIso = now.toISOString();

  // 1. 텍스트 파싱
  let parsed = parseInboxMarkdown("");
  if (group.markdownFileId) {
    const text = await drive.readText(group.markdownFileId);
    parsed = parseInboxMarkdown(text);
  } else {
    problems.push("markdown file missing");
  }
  problems.push(...parsed.problems);

  const fm = parsed.frontMatter;
  if (fm.channel && fm.channel !== channel) {
    problems.push(`front-matter channel ${fm.channel} ≠ inbox folder ${channel}; inbox 폴더 기준으로 처리`);
  }

  // 2. post_id / 폴더명
  const date = group.date ?? nowIso.slice(0, 10);
  const slug = slugify(group.slug || fm.topic || fm.headline || "untitled");
  let postId = `${date}_${slug}`;

  const draftFolderId = await statusFolderId(drive, channel, "draft");
  let suffix = 2;
  while (await drive.findChild(draftFolderId, postId)) {
    postId = `${date}_${slug}-${suffix++}`;
  }
  const postFolder = await drive.createFolder(draftFolderId, postId);
  const assetsFolder = await drive.createFolder(postFolder.id, "assets");
  await drive.createFolder(postFolder.id, "renders");
  const originalFolder = await drive.createFolder(postFolder.id, "_inbox_original");

  // 3. 이미지 → assets/source_0N.ext (복사본을 assets 에, 원본은 _inbox_original 로 이동)
  const assetNames: string[] = [];
  for (let i = 0; i < group.imageFileIds.length; i++) {
    const img = group.imageFileIds[i];
    const name = `source_${String(i + 1).padStart(2, "0")}.${extOf(img.name)}`;
    try {
      const bytes = await drive.readBytes(img.fileId);
      const src = await drive.getFile(img.fileId);
      await drive.uploadBytes(assetsFolder.id, name, bytes, src.mimeType);
      assetNames.push(name);
    } catch (e) {
      problems.push(`image ${img.name} unreadable: ${String(e)}`);
    }
  }

  // 4. 슬라이드 + 프리셋
  const stylePack = getStylePack(channelConfig?.default_style_pack ?? CHANNEL_DEFAULT_STYLE_PACK[channel]);
  const slides: SlideDef[] = [];
  const editorSlides: EditorState["slides"] = {};
  let imgCursor = 0;
  parsed.slides.forEach((s, i) => {
    const id = `s${i + 1}`;
    const presetId = defaultPresetForRole(s.role, stylePack, channelConfig?.default_presets_by_role);
    // cover/photo/screenshot 역할에 이미지를 순서대로 배정
    const wantsImage = s.role === "cover" || s.role === "photo" || s.role === "screenshot";
    const asset = wantsImage && imgCursor < assetNames.length ? assetNames[imgCursor++] : null;
    slides.push({ id, role: s.role, text: s.text, asset, style_preset: presetId });
    editorSlides[id] = slideStateFromPreset(resolvePreset(presetId, undefined, stylePack), s.text);
  });
  // 남은 이미지는 아무 슬라이드에도 안 붙었으면 첫 슬라이드에
  if (slides.length > 0 && !slides[0].asset && assetNames.length > 0 && imgCursor === 0) {
    slides[0].asset = assetNames[0];
  }

  const missingRequired: string[] = [];
  if (!fm.headline) missingRequired.push("headline");
  if (slides.length === 0) missingRequired.push("slides");
  if (!parsed.caption) missingRequired.push("caption");
  if (missingRequired.length) problems.push(`required missing: ${missingRequired.join(", ")}`);

  const status: "draft" | "needs_repair" = missingRequired.length > 0 || !group.markdownFileId ? "needs_repair" : "draft";

  // 5. 파일 쓰기
  const metadata: PostMetadata = PostMetadataSchema.parse({
    post_id: postId,
    channel,
    status,
    content_type: fm.content_type ?? (slides.length > 1 ? "carousel" : "single"),
    topic: fm.topic ?? "",
    headline: fm.headline ?? "",
    slides,
    caption: parsed.caption,
    hashtags: [...new Set([...(fm.hashtags ?? []), ...(channelConfig?.default_hashtags ?? [])])],
    alt_text: fm.alt_text,
    asset_mode: fm.asset_mode ?? (assetNames.length ? "generated" : "text_only"),
    fact_check_required: channelConfig?.editorial_rules.fact_check_required ?? channel === "LIFE",
    warnings: problems,
    created_at: nowIso,
    updated_at: nowIso,
  });
  await drive.writeText(postFolder.id, "metadata.json", JSON.stringify(metadata, null, 2), "application/json");

  const sources = SourcesFileSchema.parse({
    fact_check_status: "pending",
    items: (fm.sources ?? []).map((s) => ({ ...s })),
  });
  await drive.writeText(postFolder.id, "sources.json", JSON.stringify(sources, null, 2), "application/json");

  const brief = VisualBriefSchema.parse(
    fm.visual_direction
      ? { direction: fm.visual_direction, from_channel_default: false }
      : {
          direction: stylePack?.description ?? "",
          palette: stylePack ? Object.values(stylePack.palette) : [],
          typography: stylePack?.typography.fontFamily ?? "sans",
          from_channel_default: true,
        },
  );
  await drive.writeText(postFolder.id, "visual-brief.json", JSON.stringify(brief, null, 2), "application/json");

  const editorState = EditorStateSchema.parse({ slides: editorSlides, updated_at: nowIso });
  await drive.writeText(postFolder.id, "editor-state.json", JSON.stringify(editorState, null, 2), "application/json");

  // 6. 원본 이동
  const toMove = [
    ...(group.markdownFileId ? [group.markdownFileId] : []),
    ...group.imageFileIds.map((i) => i.fileId),
    ...group.otherFileIds.map((o) => o.fileId),
  ];
  for (const id of toMove) {
    try {
      await drive.moveFile(id, inboxFolderId, originalFolder.id);
    } catch (e) {
      problems.push(`failed to move original ${id}: ${String(e)}`);
    }
  }

  return { postId, folderId: postFolder.id, status, problems };
}
