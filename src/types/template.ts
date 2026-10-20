import { z } from "zod";
import { SlideEditorStateSchema } from "./editor-state";

export const TEMPLATE_CATEGORIES = ["cover", "photo", "color", "quote", "list", "closing", "info", "cafe", "food", "notice"] as const;
export const TemplateCategorySchema = z.enum(TEMPLATE_CATEGORIES);
export type TemplateCategory = z.infer<typeof TemplateCategorySchema>;

export const TEMPLATE_CATEGORY_LABEL: Record<TemplateCategory, string> = {
  cover: "표지",
  photo: "사진 위에",
  list: "리스트·숫자",
  closing: "마무리",
  color: "색 조합",
  cafe: "카페",
  food: "음식",
  notice: "공지·이벤트",
  quote: "인용",
  info: "정보",
};

/**
 * 슬라이드 한 장짜리 디자인 템플릿. design 은 4:5(1350) 기준 좌표이고 적용할 때 포스트 규격으로 리플로우한다.
 * 슬라이드 본문(headline)은 템플릿이 덮어쓰지 않는다 — 글 내용은 사용자 것.
 * Drive: _system/templates.json (내 템플릿). 내장 템플릿은 src/presets/templates.ts.
 */
export const TemplateSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(40),
  category: TemplateCategorySchema.default("color"),
  tags: z.array(z.string()).default([]),
  design: SlideEditorStateSchema,
  /** 썸네일에 그릴 본문 샘플 */
  sample_text: z.string().default(""),
  /** true 면 배경 사진을 쓰는 템플릿 — 적용해도 슬라이드의 사진을 유지한다 */
  photo: z.boolean().default(false),
  source: z.enum(["builtin", "custom", "reference"]).default("custom"),
  note: z.string().default(""),
  created_at: z.string().optional(),
});
export type Template = z.infer<typeof TemplateSchema>;

export const TemplatesFileSchema = z.object({
  templates: z.array(TemplateSchema).default([]),
});
export type TemplatesFile = z.infer<typeof TemplatesFileSchema>;
