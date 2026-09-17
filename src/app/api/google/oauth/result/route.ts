import { cookies } from "next/headers";
import { z } from "zod";
import { env, encryptionKey } from "@/lib/env";
import { decryptString } from "@/lib/crypto/aes";
import { GoogleSetupResultSchema } from "@/lib/google/oauth";
import { handle, json } from "@/lib/api/respond";
import { GOOGLE_SETUP_COOKIE } from "../start/route";

export const GoogleSetupResponseSchema = z.object({
  result: GoogleSetupResultSchema.nullable(),
  /** 이 refresh token 이 이미 현재 환경변수와 같은가 (설정 완료 판정) */
  active: z.boolean(),
});
export type GoogleSetupResponse = z.infer<typeof GoogleSetupResponseSchema>;

/** GET /api/google/oauth/result — 콜백이 남긴 일회성 결과. 읽으면 쿠키를 지운다. */
export async function GET() {
  return handle(async () => {
    const jar = await cookies();
    const raw = jar.get(GOOGLE_SETUP_COOKIE)?.value;
    if (!raw) return json<GoogleSetupResponse>({ result: null, active: false });
    jar.delete(GOOGLE_SETUP_COOKIE);
    try {
      const result = GoogleSetupResultSchema.parse(JSON.parse(decryptString(raw, encryptionKey())));
      return json<GoogleSetupResponse>({ result, active: env().GOOGLE_REFRESH_TOKEN === result.refresh_token });
    } catch {
      return json<GoogleSetupResponse>({ result: null, active: false });
    }
  });
}
