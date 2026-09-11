import { z } from "zod";
import type { AccountsResponse } from "@/types";
import { getDrive } from "@/lib/drive";
import { listPublicAccounts, removeAccount } from "@/lib/instagram/accounts";
import { isOauthConfigured } from "@/lib/env";
import { handle, json, readJsonBody } from "@/lib/api/respond";

/** GET /api/instagram/accounts — 토큰 제외한 계정 목록 */
export async function GET() {
  return handle(async () => {
    const drive = await getDrive();
    return json<AccountsResponse>({ accounts: await listPublicAccounts(drive), oauth_configured: isOauthConfigured() });
  });
}

const DeleteSchema = z.object({ key: z.string().min(1) });

/** DELETE /api/instagram/accounts { key } — 연결 해제 */
export async function DELETE(req: Request) {
  return handle(async () => {
    const { key } = DeleteSchema.parse(await readJsonBody(req));
    const drive = await getDrive();
    await removeAccount(drive, key);
    return json<AccountsResponse>({ accounts: await listPublicAccounts(drive), oauth_configured: isOauthConfigured() });
  });
}
