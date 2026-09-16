import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDrive } from "@/lib/drive";
import { env } from "@/lib/env";
import { exchangeCode, getLongLivedToken, getMe } from "@/lib/instagram/client";
import { connectAccount } from "@/lib/instagram/connect";
import { OAUTH_STATE_COOKIE } from "../start/route";

/**
 * GET /api/instagram/oauth/callback?code=&state=
 * code → 단기 토큰 → 장기 토큰(60일) → 계정(=채널) 생성 또는 재연결 → /settings/accounts
 * 신규 계정이면 Drive 에 /inbox/<username>/, /<username>/{draft,approved,published}/ 가 만들어진다.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = env().APP_BASE_URL;
  const fail = (reason: string) => NextResponse.redirect(`${base}/settings/accounts?error=${encodeURIComponent(reason)}`);

  const oauthError = url.searchParams.get("error");
  if (oauthError) return fail(url.searchParams.get("error_description") ?? oauthError);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get(OAUTH_STATE_COOKIE)?.value;
  jar.delete(OAUTH_STATE_COOKIE);
  if (!code || !state || !expected || state !== expected) return fail("state mismatch");

  try {
    const e = env();
    const short = await exchangeCode({ appId: e.META_APP_ID, appSecret: e.META_APP_SECRET, redirectUri: e.META_REDIRECT_URI, code });
    const long = await getLongLivedToken({ appSecret: e.META_APP_SECRET, shortToken: short.access_token });
    const me = await getMe(long.access_token);
    const drive = await getDrive();
    const { account } = await connectAccount(drive, {
      ig_user_id: me.user_id,
      username: me.username,
      access_token: long.access_token,
      expires_in_seconds: long.expires_in,
    });
    return NextResponse.redirect(`${base}/settings/accounts?connected=${encodeURIComponent(account.key)}`);
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
