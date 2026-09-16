import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { env, isOauthConfigured } from "@/lib/env";
import { buildAuthUrl } from "@/lib/instagram/client";
import { error } from "@/lib/api/respond";

export const OAUTH_STATE_COOKIE = "md_oauth_state";

/**
 * GET /api/instagram/oauth/start — Meta 인증 페이지로 리다이렉트.
 * 계정 키는 사용자가 정하지 않는다: 콜백에서 Instagram username 이 키가 된다.
 */
export async function GET(req: Request) {
  if (!isOauthConfigured()) return error(503, "META_APP_ID / META_APP_SECRET / META_REDIRECT_URI 가 설정되지 않았습니다", "oauth_not_configured");
  const url = new URL(req.url);
  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set({
    name: OAUTH_STATE_COOKIE,
    value: state,
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    path: "/",
    maxAge: 600,
  });
  const e = env();
  return NextResponse.redirect(buildAuthUrl(e.META_APP_ID, e.META_REDIRECT_URI, state));
}
