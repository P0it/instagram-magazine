import { NextResponse, type NextRequest } from "next/server";
import {
  ACCESS_COOKIE,
  ACCESS_COOKIE_MAX_AGE,
  accessCookieValue,
  constantTimeEqual,
  isAccessExempt,
} from "@/lib/access/key";

/**
 * 접근 키 검사. 로그인 없음.
 *  - APP_ACCESS_KEY 미설정 → 전부 통과 (로컬 개발)
 *  - 쿠키 md_key 일치 → 통과
 *  - ?key= 일치 → 쿠키 설정 후 key 제거한 URL로 리다이렉트
 *  - 그 외 → 404 (앱 존재를 드러내지 않음)
 * /api/public/*, /api/cron/* 은 자체 인증(서명 토큰 / Bearer)이라 제외.
 */
export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (isAccessExempt(pathname)) return NextResponse.next();

  const accessKey = process.env.APP_ACCESS_KEY ?? "";
  if (!accessKey) return NextResponse.next();

  const expected = await accessCookieValue(accessKey);
  const cookie = request.cookies.get(ACCESS_COOKIE)?.value ?? "";
  if (cookie && constantTimeEqual(cookie, expected)) return NextResponse.next();

  const provided = searchParams.get("key");
  if (provided && constantTimeEqual(provided, accessKey)) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("key");
    const res = NextResponse.redirect(url);
    res.cookies.set({
      name: ACCESS_COOKIE,
      value: expected,
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: ACCESS_COOKIE_MAX_AGE,
    });
    return res;
  }

  if (pathname.startsWith("/api/")) {
    return new NextResponse("Not Found", { status: 404 });
  }
  // 앱 존재를 드러내지 않는 최소 404 (rewrite 는 정적 페이지라 200 이 되므로 직접 응답)
  return new NextResponse(NOT_FOUND_HTML, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

const NOT_FOUND_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>404: This page could not be found.</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;color:#000;background:#fff}h1{display:inline-block;margin:0 20px 0 0;padding-right:23px;font-size:24px;font-weight:500;vertical-align:top;line-height:49px;border-right:1px solid rgba(0,0,0,.3)}h2{font-size:14px;font-weight:400;line-height:49px;margin:0;display:inline-block}</style></head><body><div><h1>404</h1><h2>This page could not be found.</h2></div></body></html>`;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
