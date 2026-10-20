import "server-only";
import { z } from "zod";
import { ReferencePatchSchema, ReferenceSchema, type Reference, type ReferenceImage, type ReferencePatch } from "@/types";
import { getDrive, isFolder, isImageMime, type DriveFile } from "@/lib/drive";
import { readReferences, writeReferences } from "@/lib/drive/system-files";
import { referenceFolderId, referenceInboxFolderId } from "@/lib/drive/paths";
import { readImageDims } from "@/lib/metadata/image-dims";
import { analyzeReferencePost, pickSlides, type VisionImage } from "@/lib/ai/reference-analyst";

export class ReferenceNotFoundError extends Error {
  constructor(id: string) {
    super(`reference not found: ${id}`);
    this.name = "ReferenceNotFoundError";
  }
}
export class ReferenceImageError extends Error {}

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_IMAGES = 20;

const CreateMetaSchema = ReferenceSchema.pick({ title: true, kind: true, account: true, url: true, tags: true, note: true, palette: true, metrics: true }).partial({ kind: true, account: true, url: true, tags: true, note: true, palette: true, metrics: true });
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

const SYNC_TTL_MS = 15_000;
const g = globalThis as typeof globalThis & { __magazineDeskRefSync?: { at: number; key: string } };
const byName = (a: DriveFile, b: DriveFile) => a.name.localeCompare(b.name, "ko", { numeric: true });

/**
 * Drive `references/` 를 훑어 보드에 반영한다. 하위 폴더 = 한 건(이미지 이름순이 슬라이드 순서, note.txt 가 있으면 메모),
 * 폴더 밖 낱장 이미지 = 한 건. 이미 가져온 건은 이미지 목록만 Drive 기준으로 갱신하고 메타(제목·태그 등)는 건드리지 않는다.
 * Drive 에서 사라진 항목은 보드에서도 빠진다. 파일은 복사하지 않고 원본 fileId 를 그대로 가리킨다.
 */
export async function syncDriveReferences(opts: { force?: boolean } = {}): Promise<void> {
  const drive = await getDrive();
  const key = `${drive.kind}:${drive.rootFolderId()}`;
  const last = g.__magazineDeskRefSync;
  if (!opts.force && last && last.key === key && Date.now() - last.at < SYNC_TTL_MS) return;
  g.__magazineDeskRefSync = { at: Date.now(), key };

  const inbox = await referenceInboxFolderId(drive);
  const children = (await drive.listChildren(inbox)).sort(byName);
  const found = new Map<string, { title: string; files: DriveFile[]; note?: DriveFile; created: string }>();
  for (const c of children) {
    if (isFolder(c)) {
      const inner = (await drive.listChildren(c.id)).sort(byName);
      const files = inner.filter((f) => isImageMime(f.mimeType)).slice(0, MAX_IMAGES);
      if (files.length === 0) continue;
      found.set(c.id, { title: c.name, files, note: inner.find((f) => /^(note|메모)\.(txt|md)$/i.test(f.name)), created: c.modifiedTime });
    } else if (isImageMime(c.mimeType)) {
      found.set(c.id, { title: c.name.replace(/\.[^.]+$/, ""), files: [c], created: c.modifiedTime });
    }
  }

  const { data, version } = await readReferences(drive);
  const ignored = new Set(data.ignored_sources);
  const now = new Date().toISOString();
  const sameImages = (a: ReferenceImage[], b: ReferenceImage[]) => a.length === b.length && a.every((x, i) => x.fileId === b[i]!.fileId);
  let changed = false;

  const kept: Reference[] = [];
  for (const r of data.references) {
    if (!r.source_id) { kept.push(r); continue; }
    const src = found.get(r.source_id);
    if (!src || ignored.has(r.source_id)) { changed = true; continue; } // Drive 에서 지워졌거나 숨김
    const images = src.files.map((f) => ({ name: f.name, fileId: f.id }));
    if (sameImages(images, r.images)) { kept.push(r); continue; }
    changed = true;
    kept.push({ ...r, images, updated_at: now });
  }
  const have = new Set(kept.map((r) => r.source_id).filter(Boolean));
  const added: Reference[] = [];
  for (const [sourceId, src] of found) {
    if (have.has(sourceId) || ignored.has(sourceId)) continue;
    const note = src.note ? (await drive.readText(src.note.id).catch(() => "")).slice(0, 2000) : "";
    const id = `ref-d${sourceId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24)}`;
    added.push(ReferenceSchema.parse({
      id, title: src.title.slice(0, 80) || "제목 없음", note, source_id: sourceId,
      images: src.files.map((f) => ({ name: f.name, fileId: f.id })), created_at: src.created, updated_at: now,
    }));
  }
  if (!changed && added.length === 0) return;
  await writeReferences(drive, { ...data, references: [...added, ...kept] }, version);
}

export async function listReferences(): Promise<Reference[]> {
  const drive = await getDrive();
  await syncDriveReferences().catch((e) => console.error("[references] Drive 동기화 실패:", e instanceof Error ? e.message : e));
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
  await writeReferences(drive, { ...data, references }, version);
  return references;
}

export async function patchReference(id: string, patch: ReferencePatch): Promise<Reference[]> {
  const body = ReferencePatchSchema.parse(patch);
  const drive = await getDrive();
  const { data, version } = await readReferences(drive);
  if (!data.references.some((r) => r.id === id)) throw new ReferenceNotFoundError(id);
  const references = data.references.map((r) => (r.id === id ? ReferenceSchema.parse({ ...r, ...body, updated_at: new Date().toISOString() }) : r));
  await writeReferences(drive, { ...data, references }, version);
  return references;
}

export async function addReferenceImages(id: string, files: File[]): Promise<Reference[]> {
  const drive = await getDrive();
  const { data } = await readReferences(drive);
  const cur = data.references.find((r) => r.id === id);
  if (!cur) throw new ReferenceNotFoundError(id);
  if (cur.source_id) throw new ReferenceImageError("Drive 에서 가져온 레퍼런스는 Drive 폴더에서 이미지를 추가해 주세요.");
  if (cur.images.length + files.length > MAX_IMAGES) throw new ReferenceImageError(`이미지는 최대 ${MAX_IMAGES}장이에요.`);
  const last = Math.max(0, ...cur.images.map((i) => Number(/^(\d+)/.exec(i.name)?.[1] ?? 0)));
  const added = await saveImages(id, files, last);
  // 읽기-수정-쓰기는 업로드 뒤에 다시 읽어 최신 버전 기준으로
  const fresh = await readReferences(drive);
  const references = fresh.data.references.map((r) => (r.id === id ? { ...r, images: [...r.images, ...added], updated_at: new Date().toISOString() } : r));
  await writeReferences(drive, { ...fresh.data, references }, fresh.version);
  return references;
}

export async function removeReferenceImage(id: string, name: string): Promise<Reference[]> {
  const drive = await getDrive();
  const { data, version } = await readReferences(drive);
  const cur = data.references.find((r) => r.id === id);
  if (!cur) throw new ReferenceNotFoundError(id);
  if (cur.source_id) throw new ReferenceImageError("Drive 에서 가져온 레퍼런스는 Drive 폴더에서 이미지를 지워 주세요.");
  const img = cur.images.find((i) => i.name === name);
  if (img) await drive.deleteFile(img.fileId).catch(() => undefined);
  const references = data.references.map((r) => (r.id === id ? { ...r, images: r.images.filter((i) => i.name !== name), updated_at: new Date().toISOString() } : r));
  await writeReferences(drive, { ...data, references }, version);
  return references;
}

export async function deleteReference(id: string): Promise<Reference[]> {
  const drive = await getDrive();
  const { data, version } = await readReferences(drive);
  const cur = data.references.find((r) => r.id === id);
  if (!cur) throw new ReferenceNotFoundError(id);
  const references = data.references.filter((r) => r.id !== id);
  if (cur.source_id) {
    // Drive 폴더에서 가져온 건 — 사용자의 원본 파일은 지우지 않고 보드에서만 숨긴다
    await writeReferences(drive, { references, ignored_sources: [...data.ignored_sources, cur.source_id] }, version);
    return references;
  }
  for (const img of cur.images) await drive.deleteFile(img.fileId).catch(() => undefined);
  await writeReferences(drive, { ...data, references }, version);
  return references;
}

/** 전문가 3인 분석을 실행해 레퍼런스에 저장한다 (슬라이드 최대 6장을 읽는다) */
export async function analyzeReference(id: string): Promise<Reference[]> {
  const drive = await getDrive();
  const { data } = await readReferences(drive);
  const cur = data.references.find((r) => r.id === id);
  if (!cur) throw new ReferenceNotFoundError(id);
  if (cur.images.length === 0) throw new ReferenceImageError("분석할 이미지가 없어요.");
  const images: VisionImage[] = [];
  for (const im of pickSlides(cur.images)) {
    const bytes = await drive.readBytes(im.fileId);
    const dims = readImageDims(bytes);
    if (!dims || dims.format === "unknown") continue;
    images.push({ bytes, mime: dims.format === "png" ? "image/png" : dims.format === "webp" ? "image/webp" : "image/jpeg" });
  }
  if (images.length === 0) throw new ReferenceImageError("읽을 수 있는 이미지가 없어요.");
  const result = await analyzeReferencePost(cur, images);
  const insight = { ...result, analyzed_at: new Date().toISOString() };
  const fresh = await readReferences(drive);
  const references = fresh.data.references.map((r) => (r.id === id ? ReferenceSchema.parse({ ...r, insight, palette: r.palette.length ? r.palette : insight.uiux.palette, updated_at: new Date().toISOString() }) : r));
  await writeReferences(drive, { ...fresh.data, references }, fresh.version);
  return references;
}
