import { timingSafeEqual } from "node:crypto";
import { getDrive } from "@/lib/drive";
import { env } from "@/lib/env";
import { runDueScheduled } from "@/lib/publish/scheduled";
import { error, handle, json } from "@/lib/api/respond";

export const maxDuration = 60;

function bearerOk(req: Request, secret: string): boolean {
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * GET /api/cron/publish — 외부 핑거(cron-job.org 등)가 5분마다 호출.
 * Authorization: Bearer CRON_SECRET. `scheduled` 이고 run_at ≤ now 인 것만 실행.
 */
export async function GET(req: Request) {
  if (!bearerOk(req, env().CRON_SECRET)) return error(401, "unauthorized", "unauthorized");
  return handle(async () => {
    const drive = await getDrive();
    return json(await runDueScheduled(drive));
  });
}
