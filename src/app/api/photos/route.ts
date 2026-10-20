import { addLibraryPhoto, listLibraryPhotos, PhotoImageError } from "@/lib/photos";
import { error, handle, json } from "@/lib/api/respond";

/** GET /api/photos — 모아둔 배경 사진 목록 (_system/photos.json), 최신순 */
export async function GET() {
  return handle(async () => json({ photos: await listLibraryPhotos() }));
}

/** POST /api/photos — multipart { meta: JSON { mood, site, pageUrl, license, author?, tags? }, file: File } */
export async function POST(req: Request) {
  return handle(async () => {
    const form = await req.formData();
    const raw = form.get("meta");
    const file = form.get("file");
    if (typeof raw !== "string" || !(file instanceof File)) return error(400, "meta and file required", "bad_request");
    let meta: unknown;
    try {
      meta = JSON.parse(raw);
    } catch {
      return error(400, "meta is not JSON", "bad_meta");
    }
    try {
      return json({ photos: await addLibraryPhoto(meta as never, file) }, { status: 201 });
    } catch (e) {
      if (e instanceof PhotoImageError) return error(400, e.message, "bad_image");
      throw e;
    }
  });
}
