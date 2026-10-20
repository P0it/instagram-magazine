import { defaultProviderId, listProviderStatus } from "@/lib/ai/provider/registry";
import { handle, json } from "@/lib/api/respond";

/** GET /api/ai/providers — 제공자별 로그인 상태. 토큰은 들어 있지 않다. */
export async function GET() {
  return handle(async () => json({ providers: await listProviderStatus(), default: defaultProviderId() }));
}
