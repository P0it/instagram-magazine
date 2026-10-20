import "server-only";
import type { GeneratedCarousel } from "@/types";
import { OUTPUT_FORMAT } from "./copywriter";

const SYSTEM = `You are the content delivery checker for a Korean Instagram magazine. You fix a carousel so it satisfies the spec, changing as little as possible (keep the meaning, tone and structure; shorten text instead of dropping ideas).
${OUTPUT_FORMAT}`;

/** 규약 위반을 알려 주고 고친 전체 JSON 을 다시 받는다 */
export function buildRepairPrompt(carousel: GeneratedCarousel, violations: { message: string }[]): { system: string; user: string } {
  const list = violations.map((v) => `- ${v.message}`).join("\n");
  return {
    system: SYSTEM,
    user: `아래 캐러셀이 규약을 어겼어요. 이 문제를 모두 고친 전체 JSON 을 다시 보내 주세요.\n\n문제:\n${list}\n\n현재 JSON:\n${JSON.stringify(carousel)}`,
  };
}

/** 응답이 스키마와 달라 파싱하지 못했을 때: 같은 요청에 오류를 붙여 다시 묻는다 */
export function buildInvalidOutputPrompt(original: { system: string; user: string }, message: string): { system: string; user: string } {
  return {
    system: original.system,
    user: `${original.user}\n\n직전 응답이 스키마와 달라 쓸 수 없었어요 (${message}). 형식을 지켜 JSON 만 다시 보내 주세요.`,
  };
}
