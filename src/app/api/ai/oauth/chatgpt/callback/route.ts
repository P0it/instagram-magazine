import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { completeChatgptLogin } from "@/lib/ai/provider/chatgpt-oauth";
import { AiError } from "@/lib/ai/provider/types";

/**
 * GET /api/ai/oauth/chatgpt/callback?code=&state=&client_id=&scope= (또는 ?error=)
 * 토큰은 서버가 받아 .env.local 에만 저장한다. 화면에는 성공/실패만 돌려준다.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const base = env().APP_BASE_URL.replace(/\/$/, "");
  try {
    await completeChatgptLogin({ code: q.get("code"), state: q.get("state"), error: q.get("error"), client_id: q.get("client_id"), scope: q.get("scope") });
    return NextResponse.redirect(`${base}/settings/ai?connected=chatgpt`);
  } catch (e) {
    const message = e instanceof AiError ? e.message : "로그인을 끝내지 못했어요";
    if (!(e instanceof AiError)) console.error("[ai-oauth] chatgpt callback failed:", e);
    return NextResponse.redirect(`${base}/settings/ai?error=${encodeURIComponent(message)}`);
  }
}
