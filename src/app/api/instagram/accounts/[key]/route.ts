import { AccountSettingsPatchSchema, type PublicAccount } from "@/types";
import { getDrive } from "@/lib/drive";
import { updateAccountSettings } from "@/lib/instagram/accounts";
import { error, handle, json, readJsonBody } from "@/lib/api/respond";

/**
 * PATCH /api/instagram/accounts/[key] — 계정(=채널) 설정 편집.
 * 바디는 AccountSettingsPatchSchema 로만 파싱되므로 key·ig_user_id·토큰·폴더 id 는 바뀌지 않는다.
 */
export async function PATCH(req: Request, ctx: RouteContext<"/api/instagram/accounts/[key]">) {
  return handle(async () => {
    const { key } = await ctx.params;
    const patch = AccountSettingsPatchSchema.parse(await readJsonBody(req));
    const drive = await getDrive();
    const updated = await updateAccountSettings(drive, key, patch);
    if (!updated) return error(404, `계정 없음: ${key}`, "not_found");
    return json<PublicAccount>(updated);
  });
}
