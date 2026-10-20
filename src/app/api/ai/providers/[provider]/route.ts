import { z } from "zod";
import { AiProviderIdSchema } from "@/types";
import { setDefaultProvider } from "@/lib/ai/provider/registry";
import { clearTokens } from "@/lib/ai/provider/token-store";
import { error, handle, json, readJsonBody } from "@/lib/api/respond";

type Ctx = { params: Promise<{ provider: string }> };

/** DELETE /api/ai/providers/chatgpt — 로그아웃(저장된 토큰 삭제). Claude 는 CLI 가 로그인을 관리하므로 앱이 지울 게 없다. */
export async function DELETE(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const id = AiProviderIdSchema.parse((await ctx.params).provider);
    if (id === "claude") return error(400, "Claude 는 터미널에서 `claude auth logout` 으로 로그아웃해 주세요", "cli_managed");
    await clearTokens(id);
    return json({ ok: true });
  });
}

/** PATCH /api/ai/providers/[provider] — { default: true } 로 이 맥의 기본 제공자를 정한다 */
export async function PATCH(req: Request, ctx: Ctx) {
  return handle(async () => {
    const id = AiProviderIdSchema.parse((await ctx.params).provider);
    z.object({ default: z.literal(true) }).parse(await readJsonBody(req));
    await setDefaultProvider(id);
    return json({ default: id });
  });
}
