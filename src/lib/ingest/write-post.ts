import "server-only";
import {
  EditorStateSchema,
  PostMetadataSchema,
  SourcesFileSchema,
  VisualBriefSchema,
  type AccountKey,
  type EditorState,
  type PostMetadata,
  type SourcesFile,
  type VisualBrief,
} from "@/types";
import type { DriveClient, DriveFile } from "@/lib/drive/types";
import { statusFolderId } from "@/lib/drive/paths";

export interface NewPostFolders {
  postId: string;
  folder: DriveFile;
  assets: DriveFile;
  original: DriveFile;
}

/**
 * /<account>/draft/<baseId>/ 와 assets · renders · _inbox_original 을 만든다.
 * 같은 이름이 있으면 `-2`, `-3`… 을 붙인다. 인제스트와 AI 생성이 같은 규칙을 쓴다.
 */
export async function createPostFolders(drive: DriveClient, channel: AccountKey, baseId: string): Promise<NewPostFolders> {
  const draftFolderId = await statusFolderId(drive, channel, "draft");
  let postId = baseId;
  let suffix = 2;
  while (await drive.findChild(draftFolderId, postId)) {
    postId = `${baseId}-${suffix++}`;
  }
  const folder = await drive.createFolder(draftFolderId, postId);
  const assets = await drive.createFolder(folder.id, "assets");
  await drive.createFolder(folder.id, "renders");
  const original = await drive.createFolder(folder.id, "_inbox_original");
  return { postId, folder, assets, original };
}

/** 포스트 폴더의 JSON 네 파일을 스키마로 검증해 쓴다 */
export async function writePostFiles(
  drive: DriveClient,
  folderId: string,
  files: { metadata: PostMetadata; sources: SourcesFile; visualBrief: VisualBrief; editorState: EditorState },
): Promise<void> {
  const write = (name: string, data: unknown) => drive.writeText(folderId, name, JSON.stringify(data, null, 2), "application/json");
  await write("metadata.json", PostMetadataSchema.parse(files.metadata));
  await write("sources.json", SourcesFileSchema.parse(files.sources));
  await write("visual-brief.json", VisualBriefSchema.parse(files.visualBrief));
  await write("editor-state.json", EditorStateSchema.parse(files.editorState));
}
