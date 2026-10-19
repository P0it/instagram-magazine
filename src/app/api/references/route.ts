import { createReference, listReferences, ReferenceImageError } from "@/lib/references";
import { error, handle, json } from "@/lib/api/respond";

/** GET /api/references — 레퍼런스 목록 (_system/references.json), 최신순 */
export async function GET() {
  return handle(async () => json({ references: await listReferences() }));
}

/**
 * POST /api/references — multipart { meta: JSON, files: File[] }
 * meta = { title, kind?, account?, url?, tags?, note?, palette? }
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
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    try {
      return json({ references: await createReference(meta as never, files) }, { status: 201 });
    } catch (e) {
      if (e instanceof ReferenceImageError) return error(400, e.message, "bad_image");
      throw e;
    }
  });
}
