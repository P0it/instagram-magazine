import { AiJobInputSchema } from "@/types";
import { AiError } from "@/lib/ai/provider/types";
import { getProvider } from "@/lib/ai/provider/registry";
import { ATTACHMENT_MIMES, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES } from "@/lib/ai/jobs/attachments";
import { enqueueJob, listJobs } from "@/lib/ai/jobs/queue";
import { error, handle, json } from "@/lib/api/respond";

/** GET /api/ai/jobs — 생성 작업 목록 (최신순) */
export async function GET() {
  return handle(async () => json({ jobs: await listJobs() }));
}

/**
 * POST /api/ai/jobs — multipart { meta: JSON(AiJobInput 에서 attachment_count 뺀 것), files: image[] }
 * AI 로그인이 없으면 401 ai_not_connected. 작업은 큐에 올리고 바로 돌려준다.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const form = await req.formData();
    const raw = form.get("meta");
    if (typeof raw !== "string") return error(400, "meta field missing", "no_meta");
    let meta: unknown;
    try {
      meta = JSON.parse(raw);
    } catch {
      return error(400, "meta is not JSON", "bad_meta");
    }
    const request = AiJobInputSchema.omit({ attachment_count: true }).parse(meta);

    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length > MAX_ATTACHMENTS) return error(400, `사진은 ${MAX_ATTACHMENTS}장까지 첨부할 수 있어요`, "too_many_attachments");
    for (const f of files) {
      if (!(ATTACHMENT_MIMES as readonly string[]).includes(f.type)) return error(400, `${f.name}: PNG·JPEG·WebP 사진만 첨부할 수 있어요`, "bad_attachment");
      if (f.size > MAX_ATTACHMENT_BYTES) return error(400, `${f.name}: 사진은 ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB 까지예요`, "bad_attachment");
    }

    try {
      await getProvider();
    } catch (e) {
      if (e instanceof AiError && e.kind === "auth") return error(401, e.message, "ai_not_connected");
      throw e;
    }
    return json({ job: await enqueueJob(request, files) }, { status: 201 });
  });
}
