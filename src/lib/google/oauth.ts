import "server-only";
import { z } from "zod";

/**
 * Google OAuth (사용자 본인 Drive 접근용). googleapis 의 OAuth2 클라이언트 대신 fetch 로 직접 —
 * 단위 테스트에서 fetch 를 바꿔 끼우기 쉽고, 필요한 호출이 두 개뿐이다.
 */
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

/** ChatGPT 가 넣는 파일도 읽어야 하므로 drive.file 이 아니라 전체 drive 스코프 */
export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/userinfo.email"];

type Fetch = typeof fetch;

export class GoogleOauthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleOauthError";
  }
}

export function buildGoogleAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const u = new URL(GOOGLE_AUTH_URL);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  u.searchParams.set("access_type", "offline"); // refresh token 을 받으려면 필수
  u.searchParams.set("prompt", "consent"); // 재연결 때도 refresh token 을 다시 발급
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state);
  return u.toString();
}

const TokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
  scope: z.string().optional(),
});

export async function exchangeGoogleCode(
  opts: { clientId: string; clientSecret: string; redirectUri: string; code: string },
  f: Fetch = fetch,
): Promise<{ access_token: string; refresh_token: string; scope: string }> {
  const body = new URLSearchParams({
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
    grant_type: "authorization_code",
    code: opts.code,
  });
  const res = await f(GOOGLE_TOKEN_URL, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof json === "object" && json && "error_description" in json ? String((json as { error_description: unknown }).error_description) : `HTTP ${res.status}`;
    throw new GoogleOauthError(`Google 토큰 교환 실패: ${msg}`);
  }
  const parsed = TokenSchema.safeParse(json);
  if (!parsed.success) throw new GoogleOauthError("Google 토큰 응답 형식이 예상과 다릅니다");
  if (!parsed.data.refresh_token) {
    throw new GoogleOauthError("refresh token 이 오지 않았습니다. Google 계정 → 보안 → 서드파티 액세스에서 이 앱을 제거한 뒤 다시 연결하세요.");
  }
  if (!(parsed.data.scope ?? "").includes("auth/drive")) {
    throw new GoogleOauthError("Drive 권한이 허용되지 않았습니다. 동의 화면에서 Drive 접근을 허용해 주세요.");
  }
  return { access_token: parsed.data.access_token, refresh_token: parsed.data.refresh_token, scope: parsed.data.scope ?? "" };
}

const UserInfoSchema = z.object({ email: z.string().optional(), name: z.string().optional() });

export async function fetchGoogleEmail(accessToken: string, f: Fetch = fetch): Promise<string | null> {
  const res = await f(GOOGLE_USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const parsed = UserInfoSchema.safeParse(await res.json().catch(() => ({})));
  return parsed.success ? (parsed.data.email ?? null) : null;
}

/** 콜백 → 설정 화면으로 넘기는 일회성 결과 (암호화 쿠키에 담긴다) */
export const GoogleSetupResultSchema = z.object({
  refresh_token: z.string(),
  email: z.string().nullable(),
  issued_at: z.string(),
  /** 로컬 개발이라 .env.local 에 자동 저장됐는가 — true 면 사용자가 할 일이 없다 */
  saved_locally: z.boolean().default(false),
});
export type GoogleSetupResult = z.infer<typeof GoogleSetupResultSchema>;
