/**
 * 접근 키 → 쿠키 값. Web Crypto 만 사용 (proxy.ts 에서도 동작).
 * cookie = hex( HMAC-SHA256( key = APP_ACCESS_KEY, msg = "magazine-desk:access" ) )
 */
export const ACCESS_COOKIE = "md_key";
export const ACCESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const MESSAGE = "magazine-desk:access";

export async function accessCookieValue(accessKey: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(accessKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(MESSAGE));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 접근 키 검사에서 제외되는 경로 */
export function isAccessExempt(pathname: string): boolean {
  return (
    pathname.startsWith("/api/public/") ||
    pathname.startsWith("/api/cron/") ||
    // ChatGPT 로그인 콜백은 127.0.0.1 로 돌아와 접근 쿠키가 없다. 서버 메모리의 state 가 맞아야만 동작하므로 안전하다.
    pathname === "/api/ai/oauth/chatgpt/callback" ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt"
  );
}
