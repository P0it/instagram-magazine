import { z } from "zod";
import { resolvePreset } from "@/presets";
import instagramJson from "@/presets/spec/instagram.json";
import designJson from "@/presets/spec/design.json";
import { FORMAT_INFO, SlideRoleSchema, formatDims, type GeneratedCarousel, type PostFormat } from "@/types";

const InstagramSpecSchema = z.object({
  version: z.string(),
  carousel: z.object({ min_slides: z.number().int(), max_slides: z.number().int(), source: z.string() }),
  caption_max: z.number().int(),
  hashtag_max: z.number().int(),
  caption_source: z.string(),
  image: z.object({ format: z.string(), max_bytes: z.number().int(), source: z.string() }),
  grid_note: z.string(),
  grid_source: z.string(),
});

const DesignSpecSchema = z.object({
  min_font_size: z.number(),
  min_font_size_source: z.string(),
  max_chars_per_slide: z.record(SlideRoleSchema, z.number().int()),
  max_chars_source: z.string(),
  first_role: SlideRoleSchema,
  closing_role_last_only: z.boolean(),
  role_source: z.string(),
  overflow_safety: z.number().min(0.5).max(1),
  overflow_source: z.string(),
});

export interface Spec {
  version: string;
  instagram: z.infer<typeof InstagramSpecSchema>;
  design: z.infer<typeof DesignSpecSchema>;
}

let cached: Spec | null = null;

/** 두 규약 JSON 을 Zod 로 검증해 합친다 */
export function loadSpec(): Spec {
  if (cached) return cached;
  const instagram = InstagramSpecSchema.parse(instagramJson);
  const design = DesignSpecSchema.parse(designJson);
  cached = { version: instagram.version, instagram, design };
  return cached;
}

export const SPEC_VERSION = loadSpec().version;

export type SpecViolation = {
  slide?: number;
  code: "slide_count" | "overflow" | "font_too_small" | "caption_too_long" | "hashtag_count" | "empty_text" | "role_order";
  message: string;
};

/** 글자 하나의 폭(em). 한글·전각 1, 영문·숫자 0.55, 공백 0.3, 이모지 2, 그 밖 0.6 */
function charEm(ch: string): number {
  if (/\p{Extended_Pictographic}/u.test(ch)) return 2;
  if (/[ᄀ-ᇿ㄰-㆏가-힯　-〿぀-ヿ一-鿿＀-￯]/u.test(ch)) return 1;
  if (/\s/.test(ch)) return 0.3;
  if (/[A-Za-z0-9]/.test(ch)) return 0.55;
  return 0.6;
}

/**
 * 줄 수 추정. 서버에는 폰트 측정 수단이 없어 글자 종류별 폭으로 센다.
 * 공백이 있으면 단어 단위로 줄바꿈하고, 한 단어가 박스보다 길면 글자 단위로 끊는다. 개행은 문단 구분.
 * `boxWidth` 는 이미 안전 계수가 곱해진 쓸 수 있는 폭이다.
 */
export function estimateLines(text: string, fontSize: number, boxWidth: number): number {
  let lines = 0;
  for (const para of text.split("\n")) {
    let line = 0;
    let used = 0;
    for (const word of para.split(/(?<=\s)/u)) {
      const chars = [...word];
      const w = chars.reduce((a, c) => a + charEm(c) * fontSize, 0);
      if (used > 0 && used + w > boxWidth) {
        line += 1;
        used = 0;
      }
      if (w <= boxWidth) {
        used += w;
        continue;
      }
      for (const c of chars) {
        const cw = charEm(c) * fontSize;
        if (used > 0 && used + cw > boxWidth) {
          line += 1;
          used = 0;
        }
        used += cw;
      }
    }
    lines += line + 1;
  }
  return lines;
}

export function validateAgainstSpec(c: GeneratedCarousel, format: PostFormat, spec: Spec = loadSpec()): SpecViolation[] {
  const out: SpecViolation[] = [];
  const { min_slides, max_slides } = spec.instagram.carousel;
  if (c.slides.length < min_slides || c.slides.length > max_slides) {
    out.push({ code: "slide_count", message: `슬라이드는 ${min_slides}~${max_slides}장이어야 해요 (지금 ${c.slides.length}장)` });
  }
  if (c.caption.length > spec.instagram.caption_max) {
    out.push({ code: "caption_too_long", message: `캡션이 ${spec.instagram.caption_max}자를 넘어요 (지금 ${c.caption.length}자)` });
  }
  if (c.hashtags.length > spec.instagram.hashtag_max) {
    out.push({ code: "hashtag_count", message: `해시태그는 ${spec.instagram.hashtag_max}개까지예요 (지금 ${c.hashtags.length}개)` });
  }

  const { height } = formatDims(format);
  const last = c.slides.length - 1;
  c.slides.forEach((s, i) => {
    if (!s.text.trim()) {
      out.push({ slide: i, code: "empty_text", message: `${i + 1}번째 슬라이드 글이 비었어요` });
      return;
    }
    if (i === 0 && s.role !== spec.design.first_role) {
      out.push({ slide: i, code: "role_order", message: `첫 슬라이드는 ${spec.design.first_role} 이어야 해요` });
    }
    if (spec.design.closing_role_last_only && s.role === "closing" && i !== last) {
      out.push({ slide: i, code: "role_order", message: `closing 은 마지막 슬라이드에만 쓸 수 있어요 (${i + 1}번째)` });
    }
    const maxChars = spec.design.max_chars_per_slide[s.role];
    if (maxChars !== undefined && [...s.text].length > maxChars) {
      out.push({ slide: i, code: "overflow", message: `${i + 1}번째 슬라이드(${s.role}) 글이 ${maxChars}자를 넘어요` });
    }

    const preset = resolvePreset(s.preset, s.overrides);
    if (preset.defaultFontSize < spec.design.min_font_size) {
      out.push({ slide: i, code: "font_too_small", message: `${i + 1}번째 슬라이드 글자 크기가 ${spec.design.min_font_size}px 보다 작아요` });
      return;
    }
    const boxWidth = 1080 * preset.textWidthRatio * spec.design.overflow_safety;
    const lines = estimateLines(s.text, preset.defaultFontSize, boxWidth);
    const heightLimit = Math.floor((height - 2 * preset.safeMargin) / (preset.defaultFontSize * preset.toneDefaults.lineHeight));
    const maxLines = Math.min(preset.maxLines, heightLimit);
    if (lines > maxLines) {
      out.push({ slide: i, code: "overflow", message: `${i + 1}번째 슬라이드 글이 ${lines}줄로 추정돼 ${maxLines}줄을 넘어요 (${s.preset})` });
    }
  });
  return out;
}

/** 프롬프트에 넣을 규약 요약 */
export function specPromptBlock(format: PostFormat, spec: Spec = loadSpec()): string {
  const f = FORMAT_INFO[format];
  const { instagram: ig, design: d } = spec;
  return [
    `# 규약 (version ${spec.version})`,
    `- 캔버스: ${f.label} (${f.hint}). 모든 슬라이드가 같은 규격이다. 폭 1080 고정, 높이 ${f.height}.`,
    `- 슬라이드 ${ig.carousel.min_slides}~${ig.carousel.max_slides}장. 첫 장은 ${d.first_role}, closing 은 마지막 장에만.`,
    `- 캡션 ${ig.caption_max}자 이하, 해시태그 ${ig.hashtag_max}개 이하.`,
    `- 글자 크기 ${d.min_font_size}px 이상.`,
    `- 장당 글자 수 상한: ${Object.entries(d.max_chars_per_slide).map(([k, v]) => `${k} ${v}`).join(", ")}.`,
    `- ${ig.grid_note}`,
  ].join("\n");
}
