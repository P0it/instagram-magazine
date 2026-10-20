import "server-only";
import { z } from "zod";
import { LAYOUT_PRESETS } from "@/presets";
import { PRESET_IDS, PresetIdSchema, type Reference } from "@/types";

const str = z.string().default("");
const list = z.array(z.string()).default([]);

/** 레퍼런스 분석가의 결과: 큐레이터·마케터·UI/UX 관점 요약 + 어울리는 프리셋 */
export const AnalystOutputSchema = z.object({
  curator: z.object({ topic: str, angle: str, tone: str, takeaway: str }).default({ topic: "", angle: "", tone: "", takeaway: "" }),
  marketer: z.object({ hook_type: str, hook_note: str, structure: str, cta: str, save_trigger: str }).default({ hook_type: "", hook_note: "", structure: "", cta: "", save_trigger: "" }),
  uiux: z.object({ cover_layout: str, body_layout: str, typography: str, palette: list, density: z.enum(["low", "mid", "high"]).catch("mid") }).default({ cover_layout: "", body_layout: "", typography: "", palette: [], density: "mid" }),
  why: list,
  reuse: list,
  suggested_presets: z.array(PresetIdSchema).default([]),
});
export type AnalystOutput = z.infer<typeof AnalystOutputSchema>;

const SYSTEM = `You are three Korean Instagram-magazine experts reading ONE carousel post (its slides are attached in order).
- curator: what topic was chosen, from what angle, in what tone.
- marketer: why people stop, swipe and save — hook type, slide structure, call-to-action, save trigger.
- uiux: layout of the cover and body slides, type treatment, colour palette, text density — described so an editor could rebuild the structure with the layout presets below.
Describe structure only. Never copy long phrases from the slides. Do not guess numbers you cannot see. All free-text in Korean, concise.
Layout presets you may suggest (suggested_presets, in slide order, cover first): ${PRESET_IDS.join(", ")}.
Preset notes: ${LAYOUT_PRESETS.map((p) => `${p.id}(${p.roles.join("/") || "any"}): ${p.description}`).join(" | ")}
Reply with ONLY a JSON object, no prose, no code fences:
{
 "curator": { "topic": str, "angle": str, "tone": str, "takeaway": str },
 "marketer": { "hook_type": str, "hook_note": str, "structure": str, "cta": str, "save_trigger": str },
 "uiux": { "cover_layout": str, "body_layout": str, "typography": str, "palette": ["#RRGGBB" x≤5], "density": "low"|"mid"|"high" },
 "why": [str x≤4],
 "reuse": [str x≤3],
 "suggested_presets": [preset id x≤10]
}`;

export function referenceFacts(ref: Reference): string {
  return [
    `제목: ${ref.title}`,
    ref.account && `계정: ${ref.account}`,
    ref.tags.length > 0 && `태그: ${ref.tags.join(", ")}`,
    ref.note && `메모: ${ref.note}`,
    ref.palette.length > 0 && `주요 색: ${ref.palette.join(" ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildAnalystPrompt(ref: Reference, imageCount: number): { system: string; user: string } {
  const user = `${referenceFacts(ref)}\n슬라이드 ${ref.images.length}장 중 ${imageCount}장을 첨부했습니다.\n\n이 게시물을 읽고 JSON 으로만 답하세요.`;
  return { system: SYSTEM, user };
}

/** 카피라이터 프롬프트에 넣을 분석 요약 */
export function analysisSummary(a: AnalystOutput): string {
  return [
    `큐레이터: 주제 ${a.curator.topic} / 각도 ${a.curator.angle} / 톤 ${a.curator.tone}`,
    `마케터: 훅 ${a.marketer.hook_type} — ${a.marketer.hook_note} / 구성 ${a.marketer.structure} / CTA ${a.marketer.cta} / 저장 유발 ${a.marketer.save_trigger}`,
    `UI/UX: 표지 ${a.uiux.cover_layout} / 본문 ${a.uiux.body_layout} / 글자 ${a.uiux.typography} / 밀도 ${a.uiux.density}`,
    a.suggested_presets.length > 0 && `어울리는 프리셋 순서: ${a.suggested_presets.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}
