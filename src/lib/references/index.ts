import "server-only";
import { z } from "zod";
import { ReferencePatchSchema, ReferenceSchema, type Reference, type ReferenceImage, type ReferencePatch } from "@/types";
import { getDrive, isImageMime } from "@/lib/drive";
import { readReferences, writeReferences } from "@/lib/drive/system-files";
import { referenceFolderId } from "@/lib/drive/paths";
import { readImageDims } from "@/lib/metadata/image-dims";

export class ReferenceNotFoundError extends Error {
  constructor(id: string) {
    super(`reference not found: ${id}`);
    this.name = "ReferenceNotFoundError";
  }
}
export class ReferenceImageError extends Error {}

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_IMAGES = 20;

const CreateMetaSchema = ReferenceSchema.pick({ title: true, kind: true, account: true, url: true, tags: true, note: true, palette: true }).partial({ kind: true, account: true, url: true, tags: true, note: true, palette: true });
export type ReferenceCreateMeta = z.input<typeof CreateMetaSchema>;

async function saveImages(refId: string, files: File[], startAt: number): Promise<ReferenceImage[]> {
  const drive = await getDrive();
  const folder = await referenceFolderId(drive, refId);
  const out: ReferenceImage[] = [];
  let n = startAt;
  for (const f of files) {
    if (f.size > MAX_BYTES) throw new ReferenceImageError("이미지는 15MB 이하여야 해요.");
    const bytes = new Uint8Array(await f.arrayBuffer());
    const dims = readImageDims(bytes);
    if (!dims) throw new ReferenceImageError("PNG/JPEG/WebP 이미지만 올릴 수 있어요.");
    const ext = dims.format === "jpeg" ? "jpg" : dims.format;
    const mime = f.type && isImageMime(f.type) ? f.type : `image/${dims.format === "jpeg" ? "jpeg" : dims.format}`;
    const name = `${String(++n).padStart(2, "0")}.${ext}`;
    const file = await drive.uploadBytes(folder, name, bytes, mime);
    out.push({ name, fileId: file.id });
  }
  return out;
}

export async function listReferences(): Promise<Reference[]> {
  const drive = await getDrive();
  const { data } = await readReferences(drive);
  return data.references.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function createReference(meta: ReferenceCreateMeta, files: File[]): Promise<Reference[]> {
  if (files.length > MAX_IMAGES) throw new ReferenceImageError(`한 번에 ${MAX_IMAGES}장까지 올릴 수 있어요.`);
  const parsed = CreateMetaSchema.parse(meta);
  const id = `ref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const images = await saveImages(id, files, 0);
  const now = new Date().toISOString();
  const ref = ReferenceSchema.parse({ ...parsed, id, images, created_at: now, updated_at: now });
  const drive = await getDrive();
  const { data, version } = await readReferences(drive);
  const references = [ref, ...data.references];
  await writeReferences(drive, { references }, version);
  return references;
}

export async function patchReference(id: string, patch: ReferencePatch): Promise<Reference[]> {
  const body = ReferencePatchSchema.parse(patch);
  const drive = await getDrive();
  const { data, version } = await readReferences(drive);
  if (!data.references.some((r) => r.id === id)) throw new ReferenceNotFoundError(id);
  const references = data.references.map((r) => (r.id === id ? ReferenceSchema.parse({ ...r, ...body, updated_at: new Date().toISOString() }) : r));
  await writeReferences(drive, { references }, version);
  return references;
}

export async function addReferenceImages(id: string, files: File[]): Promise<Reference[]> {
  const drive = await getDrive();
  const { data } = await readReferences(drive);
  const cur = data.references.find((r) => r.id === id);
  if (!cur) throw new ReferenceNotFoundError(id);
  if (cur.images.length + files.length > MAX_IMAGES) throw new ReferenceImageError(`이미지는 최대 ${MAX_IMAGES}장이에요.`);
  const last = Math.max(0, ...cur.images.map((i) => Number(/^(\d+)/.exec(i.name)?.[1] ?? 0)));
  const added = await saveImages(id, files, last);
  // 읽기-수정-쓰기는 업로드 뒤에 다시 읽어 최신 버전 기준으로
  const fresh = await readReferences(drive);
  const references = fresh.data.references.map((r) => (r.id === id ? { ...r, images: [...r.images, ...added], updated_at: new Date().toISOString() } : r));
  await writeReferences(drive, { references }, fresh.version);
  return references;
}

export async function removeReferenceImage(id: string, name: string): Promise<Reference[]> {
  const drive = await getDrive();
  const { data, version } = await readReferences(drive);
  const cur = data.references.find((r) => r.id === id);
  if (!cur) throw new ReferenceNotFoundError(id);
  const img = cur.images.find((i) => i.name === name);
  if (img) await drive.deleteFile(img.fileId).catch(() => undefined);
  const references = data.references.map((r) => (r.id === id ? { ...r, images: r.images.filter((i) => i.name !== name), updated_at: new Date().toISOString() } : r));
  await writeReferences(drive, { references }, version);
  return references;
}

export async function deleteReference(id: string): Promise<Reference[]> {
  const drive = await getDrive();
  const { data, version } = await readReferences(drive);
  const cur = data.references.find((r) => r.id === id);
  if (!cur) throw new ReferenceNotFoundError(id);
  for (const img of cur.images) await drive.deleteFile(img.fileId).catch(() => undefined);
  const references = data.references.filter((r) => r.id !== id);
  await writeReferences(drive, { references }, version);
  return references;
}
