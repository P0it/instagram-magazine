import "server-only";
import type { z } from "zod";
import { AiError, type AiProvider, type AiRequest } from "@/lib/ai/provider/types";
import type { AiProviderId, AiProviderStatus } from "@/types";

/** 규약을 통과하는 3장 캐러셀 — Mock 모드·e2e 기본 응답 */
export const MOCK_CAROUSEL = {
  headline: "봄에 가기 좋은 카페 3곳",
  topic: "봄 카페",
  caption: "저장해 두고 주말에 한 곳씩 가 보세요.",
  hashtags: ["카페", "서울카페", "주말"],
  alt_text: "봄 카페 3곳을 소개하는 캐러셀",
  slides: [
    { role: "cover", text: "봄에 가기 좋은\n카페 3곳", preset: "cover-center" },
    { role: "info", text: "1. 성수 골목 안쪽, 햇빛이 길게 들어오는 창가 자리", preset: "info-dark" },
    { role: "closing", text: "저장하고\n주말에 가 보세요", preset: "closing-slide" },
  ],
};

/** 레퍼런스 분석 단계 기본 응답 */
export const MOCK_ANALYSIS = {
  curator: { topic: "카페 소개", angle: "주말 나들이", tone: "다정함", takeaway: "한 장에 한 곳" },
  marketer: { hook_type: "number", hook_note: "숫자로 시작", structure: "표지-장소 3-마무리", cta: "저장 유도", save_trigger: "주소 목록" },
  uiux: { cover_layout: "가운데 큰 제목", body_layout: "짧은 문단", typography: "굵은 산세리프", palette: ["#0a0a0a", "#ffffff"], density: "low" },
  why: ["숫자가 먼저 보인다"],
  reuse: ["장소 3곳 구성"],
  suggested_presets: ["cover-center", "info-dark", "closing-slide"],
};

type Handler = (req: AiRequest<z.ZodTypeAny>) => unknown | Promise<unknown>;

export interface MockAiOptions {
  id?: AiProviderId;
  connected?: boolean;
  supportsImages?: boolean;
  /** 배열이면 호출 순서대로 하나씩, 함수면 요청마다. 생략하면 스키마에 맞는 기본 응답 */
  replies?: unknown[] | Handler;
}

export class MockAiProvider implements AiProvider {
  readonly id: AiProviderId;
  readonly kind = "oauth" as const;
  readonly supportsImages: boolean;
  readonly calls: { system: string; user: string; images: number }[] = [];
  private connected: boolean;
  private replies: unknown[] | Handler | undefined;
  private cursor = 0;

  constructor(opts: MockAiOptions = {}) {
    this.id = opts.id ?? "claude";
    this.connected = opts.connected ?? true;
    this.supportsImages = opts.supportsImages ?? true;
    this.replies = opts.replies;
  }

  async status(): Promise<AiProviderStatus> {
    return { id: this.id, connected: this.connected, kind: this.kind, supports_images: this.supportsImages, ...(this.connected ? { account: "mock" } : {}) };
  }

  async complete<S extends z.ZodTypeAny>(req: AiRequest<S>): Promise<z.output<S>> {
    if (!this.connected) throw new AiError("auth", "Mock 제공자가 로그인되어 있지 않아요");
    this.calls.push({ system: req.system, user: req.user, images: req.images?.length ?? 0 });
    let raw: unknown;
    if (typeof this.replies === "function") raw = await this.replies(req);
    else if (Array.isArray(this.replies)) {
      if (this.cursor >= this.replies.length) throw new AiError("internal", "Mock 응답이 더 없어요");
      raw = this.replies[this.cursor++];
    } else {
      raw = [MOCK_CAROUSEL, MOCK_ANALYSIS].find((c) => req.schema.safeParse(c).success) ?? MOCK_CAROUSEL;
    }
    if (raw instanceof Error) throw raw;
    const parsed = req.schema.safeParse(raw);
    if (!parsed.success) throw new AiError("invalid_output", `Mock 응답이 스키마와 달라요: ${parsed.error.issues[0]?.message ?? ""}`);
    return parsed.data;
  }
}
