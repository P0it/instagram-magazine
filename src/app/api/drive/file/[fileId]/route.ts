import { NextResponse } from "next/server";
import { getDrive, isImageMime } from "@/lib/drive";

type Ctx = { params: Promise<{ fileId: string }> };

/**
 * GET /api/drive/file/[fileId] — same-origin 이미지 프록시 (Konva canvas taint 방지).
 * 루트 폴더 하위 파일만. ETag = md5, private cache.
 */
export async function GET(req: Request, ctx: Ctx) {
  const { fileId } = await ctx.params;
  const drive = await getDrive();
  try {
    if (!(await drive.isDescendantOf(fileId, drive.rootFolderId()))) return new NextResponse(null, { status: 404 });
    const file = await drive.getFile(fileId);
    if (!isImageMime(file.mimeType)) return new NextResponse(null, { status: 404 });
    const etag = file.md5Checksum ? `"${file.md5Checksum}"` : `"v${file.version ?? "0"}"`;
    if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers: { ETag: etag } });
    const bytes = await drive.readBytes(fileId);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(bytes.byteLength),
        ETag: etag,
        "Cache-Control": "private, max-age=300, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
