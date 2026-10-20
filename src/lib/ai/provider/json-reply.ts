import "server-only";
import type { z } from "zod";
import { AiError } from "./types";

/** 첫 `{` 부터 짝이 맞는 `}` 까지를 잘라 낸다. 문자열 안의 중괄호와 이스케이프를 무시한다. */
function sliceObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** 모델 응답에서 JSON 객체 하나를 꺼낸다 (코드펜스·앞뒤 설명 허용). 못 찾으면 invalid_output. */
export function extractJson(text: string): unknown {
  const body = sliceObject(text);
  if (!body) throw new AiError("invalid_output", "응답에서 JSON 을 찾지 못했어요");
  try {
    return JSON.parse(body);
  } catch {
    throw new AiError("invalid_output", "응답 JSON 이 깨졌어요");
  }
}

/** extractJson → 스키마 검증. 실패는 모두 invalid_output. */
export function parseJsonReply<S extends z.ZodTypeAny>(schema: S, text: string): z.output<S> {
  const parsed = schema.safeParse(extractJson(text));
  if (!parsed.success) {
    throw new AiError("invalid_output", `응답이 스키마와 달라요: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  }
  return parsed.data;
}
