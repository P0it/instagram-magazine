import { z } from "zod";
import type { AccountsResponse } from "@/types";
import { getDrive } from "@/lib/drive";
import { listPublicAccounts } from "@/lib/instagram/accounts";
import { createChannel } from "@/lib/instagram/connect";
import { isOauthConfigured } from "@/lib/env";
import { handle, json, readJsonBody } from "@/lib/api/respond";

const BodySchema = z.object({ key: z.string().min(1), name: z.string().optional() });

/**
 * POST /api/instagram/accounts/channel { key, name? } — Instagram 없이 채널만 먼저 만든다 (unlinked).
 * Drive 폴더가 생기고 초안을 받을 수 있다. 게시는 OAuth 로 계정을 붙인 뒤에.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = BodySchema.parse(await readJsonBody(req));
    const drive = await getDrive();
    await createChannel(drive, body);
    return json<AccountsResponse>({ accounts: await listPublicAccounts(drive), oauth_configured: isOauthConfigured() });
  });
}
