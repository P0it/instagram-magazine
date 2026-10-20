import "server-only";
import { LibraryPhotoMetaSchema, LibraryPhotoSchema, type LibraryPhoto, type LibraryPhotoMeta } from "@/types";
import { getDrive, isImageMime } from "@/lib/drive";
import { readPhotoLibrary, writePhotoLibrary } from "@/lib/drive/system-files";
import { photoLibraryFolderId } from "@/lib/drive/paths";
import { readImageDims } from "@/lib/metadata/image-dims";

export class PhotoNotFoundError extends Error {
  constructor(id: string) {
    super(`photo not found: ${id}`);
    this.name = "PhotoNotFoundError";
  }
}
export class PhotoImageError extends Error {}

const MAX_BYTES = 15 * 1024 * 1024;

export async function listLibraryPhotos(): Promise<LibraryPhoto[]> {
  const drive = await getDrive();
  const { data } = await readPhotoLibrary(drive);
  return data.photos.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function addLibraryPhoto(meta: LibraryPhotoMeta, file: File): Promise<LibraryPhoto[]> {
  const parsed = LibraryPhotoMetaSchema.parse(meta);
  if (file.size > MAX_BYTES) throw new PhotoImageError("이미지는 15MB 이하여야 해요.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const dims = readImageDims(bytes);
  if (!dims || dims.format === "unknown") throw new PhotoImageError("PNG/JPEG/WebP 이미지만 올릴 수 있어요.");
  const ext = dims.format === "jpeg" ? "jpg" : dims.format;
  const mime = file.type && isImageMime(file.type) ? file.type : `image/${dims.format === "jpeg" ? "jpeg" : dims.format}`;

  const id = `ph-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const drive = await getDrive();
  const folder = await photoLibraryFolderId(drive);
  const saved = await drive.uploadBytes(folder, `${id}.${ext}`, bytes, mime);
  const photo = LibraryPhotoSchema.parse({ ...parsed, id, fileId: saved.id, width: dims.width, height: dims.height, created_at: new Date().toISOString() });

  const { data, version } = await readPhotoLibrary(drive);
  const photos = [photo, ...data.photos];
  await writePhotoLibrary(drive, { photos }, version);
  return photos;
}

export async function deleteLibraryPhoto(id: string): Promise<LibraryPhoto[]> {
  const drive = await getDrive();
  const { data, version } = await readPhotoLibrary(drive);
  const cur = data.photos.find((p) => p.id === id);
  if (!cur) throw new PhotoNotFoundError(id);
  await drive.deleteFile(cur.fileId).catch(() => undefined);
  const photos = data.photos.filter((p) => p.id !== id);
  await writePhotoLibrary(drive, { photos }, version);
  return photos;
}

/** 에디터로 가져갈 때 — 사진 바이트와 출처 정보 */
export async function readLibraryPhoto(id: string): Promise<{ photo: LibraryPhoto; bytes: Uint8Array }> {
  const drive = await getDrive();
  const { data } = await readPhotoLibrary(drive);
  const photo = data.photos.find((p) => p.id === id);
  if (!photo) throw new PhotoNotFoundError(id);
  return { photo, bytes: await drive.readBytes(photo.fileId) };
}
