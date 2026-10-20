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

/** AI 가 길게 써도 잘라서 받는다 */
const text = (n: number) => z.string().transform((v) => v.trim().slice(0, n));
const list = (n: number, len: number) => z.array(text(len)).transform((a) => a.slice(0, n)).default([]);

export const HOOK_TYPES = ["number", "question", "curiosity", "urgency", "benefit", "provocation", "statement", "other"] as const;
export const HOOK_LABEL: Record<(typeof HOOK_TYPES)[number], string> = {
  number: "숫자·리스트", question: "질문", curiosity: "호기심 격차", urgency: "긴급·손해회피", benefit: "이득 제시", provocation: "도발", statement: "선언", other: "기타",
};

/** 전문가 3인(큐레이터·마케터·UI/UX)이 한 게시물을 읽은 결과 */
export const ReferenceInsightSchema = z.object({
  curator: z.object({ topic: text(80), angle: text(120), tone: text(40), takeaway: text(120) }),
  marketer: z.object({
    hook_type: z.enum(HOOK_TYPES).catch("other"),
    hook_note: text(120),
    structure: text(160),
    cta: text(100),
    save_trigger: text(100),
  }),
  uiux: z.object({
    cover_layout: text(140),
    body_layout: text(140),
    typography: text(120),
    palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).transform((a) => a.slice(0, 5)).default([]),
    density: z.enum(["low", "mid", "high"]).catch("mid"),
  }),
  why: list(4, 110),
  reuse: list(3, 110),
  analyzed_at: z.string(),
  provider: z.enum(["sdk", "cli"]),
});
export type ReferenceInsight = z.infer<typeof ReferenceInsightSchema>;

/** 모델이 돌려주는 부분 (analyzed_at·provider 는 서버가 붙인다) */
export const ReferenceInsightDraftSchema = ReferenceInsightSchema.omit({ analyzed_at: true, provider: true });

export const ReferenceMetricsSchema = z.object({
  likes: z.number().int().nonnegative().optional(),
  comments: z.number().int().nonnegative().optional(),
  followers: z.number().int().nonnegative().optional(),
});
export type ReferenceMetrics = z.infer<typeof ReferenceMetricsSchema>;

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
  /** 공개 반응 (화면에서 읽은 값) */
  metrics: ReferenceMetricsSchema.optional(),
  /** 전문가 분석 결과 — POST /api/references/[id]/analyze */
  insight: ReferenceInsightSchema.optional(),
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
export const ReferencePatchSchema = ReferenceSchema.pick({ title: true, kind: true, account: true, url: true, tags: true, note: true, palette: true, metrics: true }).partial();
export type ReferencePatch = z.infer<typeof ReferencePatchSchema>;

/** POST /api/references/[id]/apply 응답 — 내 주제에 옮긴 제목·구성안 */
export const ApplyResultSchema = z.object({
  titles: z.array(z.string()),
  slides: z.array(z.object({ role: z.string(), text: z.string() })),
  caption_hook: z.string(),
  notes: z.string(),
  provider: z.enum(["sdk", "cli"]),
});
export type ApplyResult = z.infer<typeof ApplyResultSchema>;
