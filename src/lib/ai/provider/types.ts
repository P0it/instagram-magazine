import "server-only";
import type { z } from "zod";
import type { AiConnectionKind, AiJobErrorKind, AiProviderId, AiProviderStatus } from "@/types";

/** 제공자 호출 실패. kind 는 작업 실패 이유(`AiJobErrorKind`)와 같은 분류를 쓴다. */
export class AiError extends Error {
  constructor(
    public kind: AiJobErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export type AiImage = { mime: "image/png" | "image/jpeg" | "image/webp"; bytes: Uint8Array };

export interface AiRequest<S extends z.ZodTypeAny> {
  system: string;
  user: string;
  images?: AiImage[];
  /** 응답을 이 스키마로 검증해서 돌려준다 */
  schema: S;
  signal?: AbortSignal;
}

export interface AiProvider {
  id: AiProviderId;
  kind: AiConnectionKind;
  supportsImages: boolean;
  status(): Promise<AiProviderStatus>;
  /** 스키마 검증까지 끝낸 값. 실패하면 AiError */
  complete<S extends z.ZodTypeAny>(req: AiRequest<S>): Promise<z.output<S>>;
}
