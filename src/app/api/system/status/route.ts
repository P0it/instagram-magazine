import { SystemStatusSchema, type SystemStatus } from "@/types";
import { getDrive } from "@/lib/drive";
import { readIngestLog, readChannels } from "@/lib/drive/system-files";
import { shouldAutoSync } from "@/lib/ingest/sync";
import { refreshExpiringAccounts } from "@/lib/instagram/accounts";
import { env, isOauthConfigured } from "@/lib/env";
import { handle, json } from "@/lib/api/respond";

/**
 * GET /api/system/status — 셸이 앱을 열 때 호출.
 * 토큰 만료 7일 이내 계정은 여기서 refresh (크론 불필요).
 */
export async function GET() {
  return handle(async () => {
    const drive = await getDrive();
    const [log, channels, accounts] = await Promise.all([
      readIngestLog(drive),
      readChannels(drive),
      refreshExpiringAccounts(drive),
    ]);
    return json<SystemStatus>(
      SystemStatusSchema.parse({
        drive_kind: drive.kind,
        oauth_configured: isOauthConfigured(),
        access_key_enabled: Boolean(env().APP_ACCESS_KEY),
        last_sync_at: log.data.last_sync_at,
        should_auto_sync: shouldAutoSync(log.data.last_sync_at),
        accounts,
        channels: channels.data.channels,
        recent_ingest: log.data.entries.slice(0, 50),
      }),
    );
  });
}
