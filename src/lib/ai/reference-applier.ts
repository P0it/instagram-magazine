import "server-only";
import { z } from "zod";
import type { Reference } from "@/types";
import { askClaude } from "./reference-analyst";

const clip = (n: number) => z.string().transform((v) => v.trim().slice(0, n));

export const ApplyResultSchema = z.object({
  titles: z.array(clip(60)).transform((a) => a.slice(0, 5)),
  slides: z.array(z.object({ role: clip(20), text: clip(120) })).transform((a) => a.slice(0, 12)),
  caption_hook: clip(140),
  notes: clip(200),
});
export type ApplyResult = z.infer<typeof ApplyResultSchema>;

const SYSTEM = `You help a Korean life-information Instagram magazine reuse the STRUCTURE of a reference post for its own topic.
You get the reference's expert analysis (hook type, slide structure, layout) and the user's topic.
Write original Korean copy for the user's topic that follows the same structure and hook type. Never reuse the reference's wording, names or facts.
Reply with ONLY a JSON object, no prose, no code fences:
{
 "titles": [str≤60 x3-5],                      // cover-title candidates using the reference's hook type
 "slides": [{"role": "표지"|"본문"|"마무리"|..., "text": str≤120} x≤12],  // slide-by-slide outline mirroring the reference's structure
 "caption_hook": str≤140,                        // first line of the caption
 "notes": str≤200                                // what was kept from the structure, and what to verify (facts, sources)
}
Do not invent statistics, amounts, ages, dates or sources — titles and slides must not contain such figures unless the user's topic itself states them; use placeholders like "OO만원" and list them under 확인 필요 in notes. If the topic needs facts, mark them as "확인 필요" in notes.`;

export async function applyReference(ref: Reference, topic: string): Promise<ApplyResult & { provider: "sdk" | "cli" }> {
  const i = ref.insight;
  if (!i) throw new Error("먼저 전문가 분석을 실행해 주세요.");
  const prompt = [
    `주제: ${topic}`,
    `레퍼런스 구조 — 훅: ${i.marketer.hook_type} / ${i.marketer.hook_note}`,
    `슬라이드 구성: ${i.marketer.structure}`,
    `마무리: ${i.marketer.cta}`,
    `저장 트리거: ${i.marketer.save_trigger}`,
    `표지 레이아웃: ${i.uiux.cover_layout}`,
    `본문 레이아웃: ${i.uiux.body_layout}`,
    `톤: ${i.curator.tone}`,
    `슬라이드 수: ${ref.images.length}장`,
    "",
    "위 구조를 따르되 주제에 맞는 새 문구로 JSON 을 작성하세요.",
  ].join("\n");
  const { text, provider } = await askClaude(SYSTEM, prompt);
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("결과에 JSON 이 없어요");
  return { ...ApplyResultSchema.parse(JSON.parse(text.slice(a, b + 1))), provider };
}
