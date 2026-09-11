import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { env, isOauthConfigured } from "@/lib/env";
import { buildAuthUrl } from "@/lib/instagram/client";
import { error } from "@/lib/api/respond";

export const OAUTH_STATE_COOKIE = "md_oauth_state";
const KeySchema = z.string().regex(/^[a-z0-9_-]{1,32}$/i);

/** GET /api/instagram/oauth/start?key=life — Meta 인증 페이지로 리다이렉트 */
export async function GET(req: Request) {
  if (!isOauthConfigured()) return error(503, "META_APP_ID / META_APP_SECRET / META_REDIRECT_URI 가 설정되지 않았습니다", "oauth_not_configured");
  const url = new URL(req.url);
  const parsed = KeySchema.safeParse(url.searchParams.get("key") ?? "");
  if (!parsed.success) return error(400, "key 파라미터가 필요합니다 (예: life)", "bad_key");

  const nonce = randomBytes(16).toString("hex");
  const state = `${parsed.data}.${nonce}`;
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
