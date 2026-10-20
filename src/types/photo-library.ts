import { z } from "zod";

/**
 * 모아둔 배경 사진 — 라이선스가 허용된 사이트에서 직접 골라 담은 것. 파일은 Drive `_system/photos/`, 목록은 `_system/photos.json`.
 * 출처(사이트·작가·링크)와 라이선스를 사진마다 남긴다.
 */
export const LibraryPhotoSchema = z.object({
  id: z.string().regex(/^ph-[a-z0-9-]+$/),
  fileId: z.string(),
  /** PHOTO_MOODS 의 id (필름 스냅·키치 …) */
  mood: z.string().max(24),
  tags: z.array(z.string().max(24)).max(12).default([]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** 가져온 사이트 이름 (예: Burst, Wikimedia Commons) */
  site: z.string().max(60),
  author: z.string().max(120).default(""),
  /** 사진 원본 페이지 */
  pageUrl: z.string().max(500),
  /** 라이선스 한 줄 (예: "CC0", "Pixabay Content License") */
  license: z.string().max(80),
  created_at: z.string(),
});
export type LibraryPhoto = z.infer<typeof LibraryPhotoSchema>;

export const PhotoLibraryFileSchema = z.object({ photos: z.array(LibraryPhotoSchema).default([]) });
export type PhotoLibraryFile = z.infer<typeof PhotoLibraryFileSchema>;

export const LibraryPhotoMetaSchema = LibraryPhotoSchema.pick({ mood: true, tags: true, site: true, author: true, pageUrl: true, license: true }).partial({ tags: true, author: true });
export type LibraryPhotoMeta = z.input<typeof LibraryPhotoMetaSchema>;
