import "server-only";
import type { z } from "zod";
import { getDrive } from "@/lib/drive";
import type { DriveClient } from "@/lib/drive/types";
import { readReferences, readTemplates } from "@/lib/drive/system-files";
import { getAccount } from "@/lib/instagram/accounts";
import { getBuiltinTemplate } from "@/presets/templates";
import { SPEC_VERSION, validateAgainstSpec } from "@/lib/ai/spec";
import { AiError, type AiImage, type AiProvider } from "@/lib/ai/provider/types";
import { getProvider } from "@/lib/ai/provider/registry";
import { AnalystOutputSchema, buildAnalystPrompt, type AnalystOutput } from "@/lib/ai/roles/analyst";
import { buildCopyPrompt } from "@/lib/ai/roles/copywriter";
import { buildInvalidOutputPrompt, buildRepairPrompt } from "@/lib/ai/roles/delivery";
import { GeneratedCarouselSchema, type AiJobInput, type AiJobStage, type GeneratedCarousel, type Reference, type Template } from "@/types";
import { saveGeneratedPost, type GeneratedAttachment } from "./save";

/** 수정 요청(규약 위반·스키마 불일치 합쳐서)은 작업당 최대 2회. 그래서 AI 호출은 분석 1 + 카피 1 + 수정 2 = 최대 4회. */
export const MAX_REPAIRS = 2;
const MAX_ANALYSIS_IMAGES = 6;

export class CanceledError extends Error {
  constructor() {
    super("작업이 취소됐어요");
    this.name = "CanceledError";
  }
}

export interface PipelineHooks {
  onStage(stage: AiJobStage): Promise<void>;
  /** AI 호출 직전마다 */
  onCall(): Promise<void>;
  signal?: AbortSignal;
}

export interface PipelineDeps {
  provider?: AiProvider;
  drive?: DriveClient;
}

type VisionMime = AiImage["mime"];
const isVisionMime = (m: string): m is VisionMime => m === "image/png" || m === "image/jpeg" || m === "image/webp";

/** 슬라이드가 많으면 표지·끝을 포함해 고르게 뽑는다 */
function pickEvenly<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  return Array.from({ length: max }, (_, i) => items[Math.round((i * (items.length - 1)) / (max - 1))]!);
}

async function loadReferenceImages(drive: DriveClient, ref: Reference): Promise<AiImage[]> {
  const out: AiImage[] = [];
  for (const img of pickEvenly(ref.images, MAX_ANALYSIS_IMAGES)) {
    try {
      const meta = await drive.getFile(img.fileId);
      if (isVisionMime(meta.mimeType)) out.push({ mime: meta.mimeType, bytes: await drive.readBytes(img.fileId) });
    } catch (e) {
      console.warn(`[ai-generate] reference image ${img.name} unreadable:`, e);
    }
  }
  return out;
}

async function findTemplate(drive: DriveClient, id: string): Promise<Template | undefined> {
  return getBuiltinTemplate(id) ?? (await readTemplates(drive)).data.templates.find((t) => t.id === id);
}

/** 규약 검증 + 이 작업이 요구한 조건(장수·첨부 번호) 점검. 메시지는 수정 요청에 그대로 쓰인다. */
function collectViolations(c: GeneratedCarousel, input: AiJobInput): { message: string }[] {
  const out: { message: string }[] = validateAgainstSpec(c, input.format);
  if (input.slide_count && c.slides.length !== input.slide_count) {
    out.push({ message: `슬라이드를 정확히 ${input.slide_count}장으로 만들어 주세요 (지금 ${c.slides.length}장)` });
  }
  c.slides.forEach((s, i) => {
    if (s.attachment !== undefined && s.attachment >= input.attachment_count) {
      out.push({ message: `${i + 1}번째 슬라이드의 attachment ${s.attachment} 는 없는 사진이에요 (첨부 ${input.attachment_count}장)` });
    }
  });
  return out;
}

/** 저장 직전: 없는 첨부 번호는 떼어 낸다 (위반은 warnings 에 이미 남아 있다) */
function dropMissingAttachments(c: GeneratedCarousel, count: number): GeneratedCarousel {
  return { ...c, slides: c.slides.map((s) => (s.attachment !== undefined && s.attachment >= count ? { ...s, attachment: undefined } : s)) };
}

/**
 * 분석(필요할 때만) → 카피+프리셋 선택 → 규약 검증·수정(최대 2회) → draft 저장.
 * 규약 위반이 끝내 남아도 실패시키지 않고 `warnings` 로 남긴 채 draft 로 저장한다.
 */
export async function runGeneration(
  input: AiJobInput,
  attachments: GeneratedAttachment[],
  hooks: PipelineHooks,
  deps: PipelineDeps = {},
): Promise<{ postId: string }> {
  const drive = deps.drive ?? (await getDrive());
  const account = await getAccount(drive, input.account_key);
  if (!account) throw new AiError("not_found", `계정 ${input.account_key} 를 찾지 못했어요`);

  let reference: Reference | undefined;
  if (input.reference_id) {
    reference = (await readReferences(drive)).data.references.find((r) => r.id === input.reference_id);
    if (!reference) throw new AiError("not_found", `레퍼런스 ${input.reference_id} 를 찾지 못했어요`);
  }
  let template: Template | undefined;
  if (input.template_id) {
    template = await findTemplate(drive, input.template_id);
    if (!template) throw new AiError("not_found", `템플릿 ${input.template_id} 를 찾지 못했어요`);
  }

  const provider = deps.provider ?? (await getProvider());
  const check = () => {
    if (hooks.signal?.aborted) throw new CanceledError();
  };
  const ask = async <S extends z.ZodTypeAny>(prompt: { system: string; user: string }, schema: S, images?: AiImage[]): Promise<z.output<S>> => {
    check();
    await hooks.onCall();
    return provider.complete({ ...prompt, schema, images, signal: hooks.signal });
  };

  // 1. 분석 — 레퍼런스 이미지를 읽을 수 있는 제공자일 때만. 분석은 선택 단계라 응답이 깨져도 없이 진행한다.
  let analysis: AnalystOutput | undefined;
  const warnings: string[] = [];
  if (reference && provider.supportsImages && reference.images.length > 0) {
    const images = await loadReferenceImages(drive, reference);
    if (images.length > 0) {
      await hooks.onStage("analyze");
      try {
        analysis = await ask(buildAnalystPrompt(reference, images.length), AnalystOutputSchema, images);
      } catch (e) {
        if (!(e instanceof AiError) || e.kind !== "invalid_output") throw e;
        warnings.push("레퍼런스 이미지 분석 응답을 읽지 못해 분석 없이 만들었어요");
      }
    }
  }

  // 2. 카피 + 프리셋 선택. 스키마가 안 맞는 응답도 수정 1회로 센다.
  await hooks.onStage("copy");
  let prompt = buildCopyPrompt({ brief: input.brief, format: input.format, slideCount: input.slide_count, analysis, reference, template, attachmentCount: input.attachment_count });
  let repairs = 0;
  let carousel: GeneratedCarousel | undefined;
  while (!carousel) {
    try {
      carousel = await ask(prompt, GeneratedCarouselSchema);
    } catch (e) {
      if (!(e instanceof AiError) || e.kind !== "invalid_output" || repairs >= MAX_REPAIRS) throw e;
      repairs++;
      prompt = buildInvalidOutputPrompt(prompt, e.message);
    }
  }
  await hooks.onStage("layout");

  // 3. 규약 검증 → 위반이 있으면 수정 요청
  await hooks.onStage("review");
  let violations = collectViolations(carousel, input);
  while (violations.length > 0 && repairs < MAX_REPAIRS) {
    repairs++;
    try {
      carousel = await ask(buildRepairPrompt(carousel, violations), GeneratedCarouselSchema);
    } catch (e) {
      // 수정 응답이 깨졌으면 직전 결과를 그대로 두고 남은 위반을 경고로 남긴다
      if (!(e instanceof AiError) || e.kind !== "invalid_output") throw e;
      break;
    }
    violations = collectViolations(carousel, input);
  }

  // 4. 저장
  check();
  await hooks.onStage("save");
  const { postId } = await saveGeneratedPost(drive, account, dropMissingAttachments(carousel, attachments.length), {
    format: input.format,
    attachments,
    warnings: [...warnings, ...violations.map((v) => v.message)],
    generation: {
      ...(reference ? { reference_id: reference.id } : {}),
      ...(template ? { template_id: template.id } : {}),
      brief: input.brief,
      provider: provider.id,
      spec_version: SPEC_VERSION,
      generated_at: new Date().toISOString(),
    },
  });
  return { postId };
}
