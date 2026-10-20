import { z } from "zod";

/**
 * 레퍼런스 보드 한 건 — 잘 되는 피드/디자인을 모아 두는 영감 보관함.
 * 캐러셀이면 images 가 슬라이드 순서. 이미지는 Drive `_system/references/<id>/` 에 둔다.
 * Drive: _system/references.json
 */
export const ReferenceImageSchema = z.object({
  name: z.string(),
  fileId: z.string(),
});
export type ReferenceImage = z.infer<typeof ReferenceImageSchema>;

export const REFERENCE_KINDS = ["feed", "design", "palette"] as const;
export const ReferenceKindSchema = z.enum(REFERENCE_KINDS);
export type ReferenceKind = z.infer<typeof ReferenceKindSchema>;

export const REFERENCE_KIND_LABEL: Record<ReferenceKind, string> = { feed: "인스타 피드", design: "디자인", palette: "색 조합" };

export const ReferenceSchema = z.object({
  id: z.string().regex(/^ref-[a-z0-9-]+$/),
  title: z.string().min(1).max(80),
  kind: ReferenceKindSchema.default("feed"),
  /** 인스타 계정 핸들(@ 없이) 또는 출처 이름 */
  account: z.string().max(60).default(""),
  /** 원본 게시물/페이지 링크 */
  url: z.string().max(500).default(""),
  tags: z.array(z.string().max(24)).max(12).default([]),
  note: z.string().max(2000).default(""),
  /** 이미지에서 뽑은 주요 색 (#RRGGBB, 비중 순) */
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(8).default([]),
  images: z.array(ReferenceImageSchema).default([]),
  /** Drive `references/` 폴더에서 자동으로 가져온 건이면 그 폴더(또는 이미지 파일) id. 이미지는 Drive 가 원본이다. */
  source_id: z.string().max(100).optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Reference = z.infer<typeof ReferenceSchema>;

export const ReferencesFileSchema = z.object({
  references: z.array(ReferenceSchema).default([]),
  /** 보드에서 숨긴 Drive 항목 id — 다시 가져오지 않는다 (Drive 파일은 건드리지 않음) */
  ignored_sources: z.array(z.string()).default([]),
});
export type ReferencesFile = z.infer<typeof ReferencesFileSchema>;

/** PATCH 로 바꿀 수 있는 메타 */
export const ReferencePatchSchema = ReferenceSchema.pick({ title: true, kind: true, account: true, url: true, tags: true, note: true, palette: true }).partial();
export type ReferencePatch = z.infer<typeof ReferencePatchSchema>;
