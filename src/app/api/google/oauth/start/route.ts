import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { env, googleRedirectUri, isGoogleOauthConfigured } from "@/lib/env";
import { buildGoogleAuthUrl } from "@/lib/google/oauth";
import { error } from "@/lib/api/respond";

export const GOOGLE_STATE_COOKIE = "md_google_state";
export const GOOGLE_SETUP_COOKIE = "md_google_setup";

/** GET /api/google/oauth/start — Google 동의 화면으로. refresh token 을 받아 환경변수에 넣는 1회성 흐름의 시작. */
export async function GET(req: Request) {
  if (!isGoogleOauthConfigured()) return error(503, "GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET 가 설정되지 않았습니다", "google_oauth_not_configured");
  const url = new URL(req.url);
  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set({ name: GOOGLE_STATE_COOKIE, value: state, httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", path: "/", maxAge: 600 });
  return NextResponse.redirect(buildGoogleAuthUrl(env().GOOGLE_OAUTH_CLIENT_ID, googleRedirectUri(), state));
}
