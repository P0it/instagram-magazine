import "server-only";
import { LAYOUT_PRESETS } from "@/presets";
import { specPromptBlock } from "@/lib/ai/spec";
import type { Reference, Template, PostFormat } from "@/types";
import { analysisSummary, referenceFacts, type AnalystOutput } from "./analyst";

/** 카피라이터와 수정 요청이 같은 출력 형식을 쓴다 */
export const OUTPUT_FORMAT = `Reply with ONLY a JSON object, no prose, no code fences:
{
 "headline": str,            // 표지 한 줄 제목
 "topic": str,               // 주제 한 줄 (폴더 이름에 쓰임)
 "caption": str,             // 인스타 캡션
 "hashtags": [str],          // # 없이
 "alt_text": str,            // 선택
 "slides": [
   { "role": "cover"|"photo"|"info"|"quote"|"screenshot"|"closing",
     "text": str,            // 슬라이드에 들어갈 글. 줄바꿈은 \\n
     "preset": preset id,    // 아래 목록에서만 고른다
     "attachment": int       // 선택: 사용자가 첨부한 사진 번호(0부터). 사진이 필요 없으면 생략
   }
 ]
}
"overrides" 는 쓰지 않는다.`;

function presetCatalog(): string {
  return LAYOUT_PRESETS.map(
    (p) => `- ${p.id} (역할 ${p.roles.join("/") || "any"}): ${p.description} 글자 ${p.defaultFontSize}px, 폭 ${Math.round(p.textWidthRatio * 100)}%, 최대 ${p.maxLines}줄`,
  ).join("\n");
}

export interface CopyInput {
  brief: string;
  format: PostFormat;
  slideCount?: number;
  analysis?: AnalystOutput;
  reference?: Reference;
  template?: Template;
  attachmentCount: number;
}

export function buildCopyPrompt(i: CopyInput): { system: string; user: string } {
  const system = [
    "You are a Korean Instagram magazine copywriter and layout picker. Write a finished carousel the editor only needs to touch up.",
    "한국어로 쓴다. 레퍼런스는 구성과 톤만 따르고 문장을 베끼지 않는다. 표지는 한 줄 후크, 마지막 장은 저장·공유를 부르는 마무리.",
    "글은 짧게 끊어 쓴다. 아래 프리셋의 글자 크기·폭·최대 줄 수를 넘지 않게 장당 글자 수를 조절한다.",
    specPromptBlock(i.format),
    `# 쓸 수 있는 레이아웃 프리셋\n${presetCatalog()}`,
    OUTPUT_FORMAT,
  ].join("\n\n");

  const parts = [
    `지침:\n${i.brief.trim() || "(지침 없음 — 레퍼런스의 주제와 구성을 따라 새 내용으로 만들어 주세요)"}`,
    i.slideCount ? `슬라이드는 정확히 ${i.slideCount}장.` : "슬라이드 수는 내용에 맞게 정한다.",
    i.attachmentCount > 0 ? `사용자가 사진 ${i.attachmentCount}장을 첨부했다 (번호 0~${i.attachmentCount - 1}). 어울리는 슬라이드의 attachment 로 쓴다.` : "첨부 사진은 없다. attachment 는 쓰지 않는다.",
  ];
  if (i.reference) parts.push(`레퍼런스:\n${referenceFacts(i.reference)}`);
  if (i.analysis) parts.push(`레퍼런스 분석:\n${analysisSummary(i.analysis)}`);
  if (i.template) {
    parts.push(`템플릿: ${i.template.name} (${i.template.category}) 태그 ${i.template.tags.join(", ") || "-"}${i.template.note ? ` — ${i.template.note}` : ""}${i.template.photo ? " · 배경 사진을 쓰는 템플릿" : ""}`);
  }
  return { system, user: parts.join("\n\n") };
}
