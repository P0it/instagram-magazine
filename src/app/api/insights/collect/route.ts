import { getDrive } from "@/lib/drive";
import { collectInsights } from "@/lib/insights/collect";
import { handle, json } from "@/lib/api/respond";

export const maxDuration = 60;

/** POST /api/insights/collect — 사용자가 "지금 수집" 버튼으로 호출 */
export async function POST() {
  return handle(async () => {
    const drive = await getDrive();
    return json(await collectInsights(drive));
  });
}
