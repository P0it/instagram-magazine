import { timingSafeEqual } from "node:crypto";
import { getDrive } from "@/lib/drive";
import { env } from "@/lib/env";
import { collectInsights } from "@/lib/insights/collect";
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
 * GET /api/cron/insights — 외부 핑거가 하루 1회(UTC 자정 이후) 호출.
 * Authorization: Bearer CRON_SECRET. 계정·게시물 인사이트를 Drive 스냅샷에 반영.
 */
export async function GET(req: Request) {
  if (!bearerOk(req, env().CRON_SECRET)) return error(401, "unauthorized", "unauthorized");
  return handle(async () => {
    const drive = await getDrive();
    return json(await collectInsights(drive));
  });
}
