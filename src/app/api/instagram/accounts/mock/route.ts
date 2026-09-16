import { z } from "zod";
import type { AccountsResponse } from "@/types";
import { getDrive } from "@/lib/drive";
import { listPublicAccounts } from "@/lib/instagram/accounts";
import { connectAccount } from "@/lib/instagram/connect";
import { isOauthConfigured } from "@/lib/env";
import { error, handle, json, readJsonBody } from "@/lib/api/respond";

const BodySchema = z.object({ username: z.string().min(1) });

/**
 * POST /api/instagram/accounts/mock { username } — Mock Drive 전용 가짜 연결.
 * OAuth 콜백과 같은 생성 흐름(폴더 생성 포함)을 가짜 토큰으로 수행한다. Google Drive 모드에선 404.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const drive = await getDrive();
    if (drive.kind !== "mock") return error(404, "Not found", "not_found");
    const { username } = BodySchema.parse(await readJsonBody(req));
    const normalized = username.trim().replace(/^@/, "").toLowerCase();
    await connectAccount(drive, {
      ig_user_id: `mock-${normalized}`,
      username: normalized,
      access_token: `mock-token-${normalized}`,
      expires_in_seconds: 60 * 24 * 60 * 60,
    });
    return json<AccountsResponse>({ accounts: await listPublicAccounts(drive), oauth_configured: isOauthConfigured() });
  });
}
