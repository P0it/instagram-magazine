import { NextResponse } from "next/server";
import { getDrive, isImageMime } from "@/lib/drive";
import { encryptionKey } from "@/lib/env";
import { verifySignedToken } from "@/lib/crypto/signed-url";

type Ctx = { params: Promise<{ token: string }> };

/**
 * GET /api/public/[token] — Instagram 이 렌더를 가져가는 서명 URL.
 * proxy.ts 접근 키 검사 제외 경로. 서명/만료 불일치 → 404.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const payload = verifySignedToken(token, encryptionKey());
  if (!payload) return new NextResponse(null, { status: 404 });
  const drive = await getDrive();
  try {
    if (!(await drive.isDescendantOf(payload.f, drive.rootFolderId()))) return new NextResponse(null, { status: 404 });
    const file = await drive.getFile(payload.f);
    if (!isImageMime(file.mimeType)) return new NextResponse(null, { status: 404 });
    const bytes = await drive.readBytes(payload.f);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "public, max-age=600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
