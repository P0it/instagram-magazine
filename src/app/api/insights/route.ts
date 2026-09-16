import { InsightsRangeSchema } from "@/types";
import { getDrive } from "@/lib/drive";
import { queryInsights } from "@/lib/insights/query";
import { handle, json } from "@/lib/api/respond";

/** GET /api/insights?range=7|28|90 — Drive 스냅샷 기반 성과 요약 */
export async function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url);
    const range = InsightsRangeSchema.catch("28").parse(url.searchParams.get("range") ?? "28");
    const drive = await getDrive();
    return json(await queryInsights(drive, range));
  });
}
