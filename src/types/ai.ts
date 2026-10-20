import { z } from "zod";
import { AccountKeySchema } from "./account";
import { PostFormatSchema } from "./editor-state";
import { LayoutPresetOverridesSchema, PresetIdSchema } from "./preset";
import { SlideRoleSchema } from "./slide-role";

// ---------- 제공자 ----------
export const AiProviderIdSchema = z.enum(["claude", "chatgpt"]);
export type AiProviderId = z.infer<typeof AiProviderIdSchema>;

/** oauth: 앱이 직접 구독 로그인(OAuth)을 처리 · cli: 이 PC 에 로그인된 CLI 를 호출 */
export const AiConnectionKindSchema = z.enum(["oauth", "cli"]);
export type AiConnectionKind = z.infer<typeof AiConnectionKindSchema>;

/** 브라우저로 내려가는 제공자 상태. 토큰은 절대 들어가지 않는다. */
export const AiProviderStatusSchema = z.object({
  id: AiProviderIdSchema,
  connected: z.boolean(),
  kind: AiConnectionKindSchema,
  account: z.string().optional(),
  expires_at: z.string().optional(),
  supports_images: z.boolean(),
  last_error: z.string().optional(),
});
export type AiProviderStatus = z.infer<typeof AiProviderStatusSchema>;

// ---------- 작업 ----------
export const AI_JOB_STATUSES = ["queued", "running", "done", "failed", "canceled"] as const;
export const AiJobStatusSchema = z.enum(AI_JOB_STATUSES);
export type AiJobStatus = z.infer<typeof AiJobStatusSchema>;

/** layout = 프리셋 선택 결과를 스키마로 옮기는 단계, review = 규약 검증·수정 */
export const AI_JOB_STAGES = ["analyze", "copy", "layout", "review", "save"] as const;
export const AiJobStageSchema = z.enum(AI_JOB_STAGES);
export type AiJobStage = z.infer<typeof AiJobStageSchema>;

export const AiJobErrorKindSchema = z.enum(["auth", "quota", "not_found", "invalid_output", "interrupted", "internal"]);
export type AiJobErrorKind = z.infer<typeof AiJobErrorKindSchema>;

export const AiJobInputSchema = z.object({
  account_key: AccountKeySchema,
  reference_id: z.string().optional(),
  template_id: z.string().optional(),
  brief: z.string().max(4000),
  format: PostFormatSchema.default("4:5"),
  slide_count: z.number().int().min(3).max(10).optional(),
  attachment_count: z.number().int().min(0).max(6),
});
export type AiJobInput = z.infer<typeof AiJobInputSchema>;

export const AiJobErrorSchema = z.object({
  stage: AiJobStageSchema,
  kind: AiJobErrorKindSchema,
  message: z.string(),
});
export type AiJobError = z.infer<typeof AiJobErrorSchema>;

export const AiJobSchema = z.object({
  id: z.string().regex(/^job-[a-z0-9-]+$/),
  status: AiJobStatusSchema,
  stage: AiJobStageSchema.default("analyze"),
  input: AiJobInputSchema,
  post_id: z.string().optional(),
  error: AiJobErrorSchema.optional(),
  /** 이 작업을 잡은 러너(프로세스) id — heartbeat 와 함께 중단된 작업을 가려낸다 */
  owner: z.string().optional(),
  heartbeat_at: z.string().optional(),
  calls: z.number().int().min(0).default(0),
  created_at: z.string(),
  updated_at: z.string(),
});
export type AiJob = z.infer<typeof AiJobSchema>;

/** Drive: _system/ai-jobs.json */
export const AiJobsFileSchema = z.object({
  jobs: z.array(AiJobSchema).default([]),
});
export type AiJobsFile = z.infer<typeof AiJobsFileSchema>;

// ---------- 생성 결과 ----------
export const GeneratedSlideSchema = z.object({
  role: SlideRoleSchema,
  text: z.string(),
  /** 기존 레이아웃 프리셋 중에서 고른다. 좌표를 새로 그리지 않는다 */
  preset: PresetIdSchema,
  overrides: LayoutPresetOverridesSchema.optional(),
  /** 첨부 이미지 인덱스(0부터). 없으면 사진 없는 슬라이드 */
  attachment: z.number().int().min(0).optional(),
});
export type GeneratedSlide = z.infer<typeof GeneratedSlideSchema>;

export const GeneratedCarouselSchema = z.object({
  headline: z.string(),
  topic: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()).default([]),
  alt_text: z.string().optional(),
  slides: z.array(GeneratedSlideSchema),
});
export type GeneratedCarousel = z.infer<typeof GeneratedCarouselSchema>;

/** 포스트 metadata.json 에 남기는 생성 근거 */
export const GenerationInfoSchema = z.object({
  reference_id: z.string().optional(),
  template_id: z.string().optional(),
  brief: z.string(),
  provider: AiProviderIdSchema,
  spec_version: z.string(),
  generated_at: z.string(),
});
export type GenerationInfo = z.infer<typeof GenerationInfoSchema>;

// ---------- API 응답 ----------
export const AiProvidersResponseSchema = z.object({
  providers: z.array(AiProviderStatusSchema),
  default: AiProviderIdSchema.nullable(),
});
export type AiProvidersResponse = z.infer<typeof AiProvidersResponseSchema>;

export const AiJobResponseSchema = z.object({ job: AiJobSchema });
export const AiJobsResponseSchema = z.object({ jobs: z.array(AiJobSchema) });
