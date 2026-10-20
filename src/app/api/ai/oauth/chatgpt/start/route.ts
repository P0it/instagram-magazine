import { NextResponse } from "next/server";
import { startChatgptLogin } from "@/lib/ai/provider/chatgpt-oauth";
import { handle } from "@/lib/api/respond";

/**
 * GET /api/ai/oauth/chatgpt/start — ChatGPT 로그인 화면으로.
 * 콜백은 127.0.0.1 로 돌아온다(OpenAI 규칙). PKCE·state·nonce 는 서버 메모리에 두므로 어느 주소에서 시작해도 된다.
 */
export async function GET() {
  return handle(async () => NextResponse.redirect(await startChatgptLogin()));
}
