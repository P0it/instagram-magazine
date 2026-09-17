import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env, googleRedirectUri } from "@/lib/env";
import { encryptString } from "@/lib/crypto/aes";
import { encryptionKey } from "@/lib/env";
import { exchangeGoogleCode, fetchGoogleEmail, type GoogleSetupResult } from "@/lib/google/oauth";
import { persistRefreshTokenLocally } from "@/lib/google/local-env";
import { GOOGLE_SETUP_COOKIE, GOOGLE_STATE_COOKIE } from "../start/route";

/**
 * GET /api/google/oauth/callback?code=&state=
 * code → refresh token. 토큰은 Drive 에 둘 수 없으므로(그 토큰으로 Drive 를 여니까) 암호화 쿠키(10분)에 담아
 * 설정 화면이 한 번 읽어 사용자에게 보여준다 → 사용자가 GOOGLE_REFRESH_TOKEN 환경변수에 넣는다.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = env().APP_BASE_URL;
  const fail = (reason: string) => NextResponse.redirect(`${base}/settings/drive?error=${encodeURIComponent(reason)}`);

  const oauthError = url.searchParams.get("error");
  if (oauthError) return fail(url.searchParams.get("error_description") ?? oauthError);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get(GOOGLE_STATE_COOKIE)?.value;
  jar.delete(GOOGLE_STATE_COOKIE);
  if (!code || !state || !expected || state !== expected) return fail("state mismatch");

  try {
    const e = env();
    const token = await exchangeGoogleCode({ clientId: e.GOOGLE_OAUTH_CLIENT_ID, clientSecret: e.GOOGLE_OAUTH_CLIENT_SECRET, redirectUri: googleRedirectUri(), code });
    const email = await fetchGoogleEmail(token.access_token);
    // 로컬이면 .env.local 에 바로 써서 복사·재시작을 생략한다. 실패해도 화면에 토큰을 보여주는 경로가 남는다.
    const savedLocally = await persistRefreshTokenLocally(token.refresh_token).catch(() => false);
    const result: GoogleSetupResult = { refresh_token: token.refresh_token, email, issued_at: new Date().toISOString(), saved_locally: savedLocally };
    jar.set({
      name: GOOGLE_SETUP_COOKIE,
      value: encryptString(JSON.stringify(result), encryptionKey()),
      httpOnly: true,
      sameSite: "lax",
      secure: url.protocol === "https:",
      path: "/",
      maxAge: 600,
    });
    return NextResponse.redirect(`${base}/settings/drive?google=connected`);
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
