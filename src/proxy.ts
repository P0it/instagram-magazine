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
  return NextResponse.rewrite(new URL("/not-found", request.url), { status: 404 });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
