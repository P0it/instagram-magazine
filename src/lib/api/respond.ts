import "server-only";
import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { DriveNotFoundError } from "@/lib/drive/types";
import { VersionConflictError } from "@/lib/drive/system-files";
import { ConflictError, InvalidTransitionError, PostNotFoundError } from "@/lib/metadata/post-repo";
import { PublishPreconditionError } from "@/lib/publish/publish-post";
import { InstagramApiError } from "@/lib/instagram/client";
import { AttachmentsGoneError, JobNotFoundError, JobStateError } from "@/lib/ai/jobs/errors";
import type { ApiError } from "@/types";

export function json<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } });
}

export function error(status: number, message: string, code?: string, details?: unknown): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code, details }, { status, headers: { "Cache-Control": "no-store" } });
}

/** 라우트 핸들러 공통 에러 매핑 */
export async function handle(fn: () => Promise<NextResponse<unknown>>): Promise<NextResponse<unknown>> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e); // Next 내부 bailout/redirect 는 그대로 전파
    if (e instanceof ZodError) return error(400, "Validation failed", "validation", e.issues);
    if (e instanceof PostNotFoundError || e instanceof DriveNotFoundError) return error(404, e.message, "not_found");
    if (e instanceof ConflictError || e instanceof VersionConflictError) return error(409, e.message, "conflict");
    if (e instanceof InvalidTransitionError) return error(422, e.message, "invalid_transition");
    if (e instanceof PublishPreconditionError) return error(422, e.message, "publish_precondition");
    if (e instanceof InstagramApiError) return error(502, e.message, "instagram", { code: e.code, subcode: e.subcode });
    if (e instanceof JobNotFoundError) return error(404, e.message, "not_found");
    if (e instanceof AttachmentsGoneError) return error(400, e.message, "attachments_gone");
    if (e instanceof JobStateError) return error(409, e.message, "job_state");
    console.error("[api]", e);
    return error(500, e instanceof Error ? e.message : "Internal error", "internal");
  }
}

export async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
