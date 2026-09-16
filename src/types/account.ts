import { z } from "zod";
import { PresetIdSchema } from "./preset";
import { SlideRoleSchema } from "./slide-role";

/**
 * 계정 = 채널. Instagram 계정 하나가 곧 매거진 채널 하나다.
 * key 는 연결 시점의 Instagram username 이며 불변 — Drive 폴더명(`/inbox/<key>/`, `/<key>/…`)과
 * 포스트 메타의 `channel` 값으로 그대로 쓰인다.
 */
export const AccountKeySchema = z.string().regex(/^[a-z0-9._]{1,30}$/, "Instagram username 형식(소문자·숫자·._ 1~30자)");
export type AccountKey = z.infer<typeof AccountKeySchema>;

export const AccountStatusSchema = z.enum(["connected", "expiring", "expired", "error"]);
export type AccountStatus = z.infer<typeof AccountStatusSchema>;

export const EditorialRulesSchema = z.object({
  fact_check_required: z.boolean().default(false),
});

/** 사용자가 설정 화면에서 편집하는 필드. PATCH 바디는 이것만 받는다. */
export const AccountSettingsSchema = z.object({
  name: z.string().min(1),
  color: z.string().default("#171717"),
  default_style_pack: z.string().nullable().default(null),
  default_presets_by_role: z.partialRecord(SlideRoleSchema, PresetIdSchema).prefault({}),
  caption_template: z.string().default("{{caption}}\n\n{{hashtags}}"),
  default_hashtags: z.array(z.string()).default([]),
  editorial_rules: EditorialRulesSchema.default({ fact_check_required: false }),
});
export type AccountSettings = z.infer<typeof AccountSettingsSchema>;
/** 부분 갱신. 기본값이 끼어들면 안 되므로 필드마다 optional 로 다시 선언한다. */
export const AccountSettingsPatchSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  default_style_pack: z.string().nullable().optional(),
  default_presets_by_role: z.partialRecord(SlideRoleSchema, PresetIdSchema).optional(),
  caption_template: z.string().optional(),
  default_hashtags: z.array(z.string()).optional(),
  editorial_rules: z.object({ fact_check_required: z.boolean() }).optional(),
});
export type AccountSettingsPatch = z.infer<typeof AccountSettingsPatchSchema>;

/** _system/accounts.json 항목. 토큰은 AES-256-GCM 으로 암호화되어 있다. */
export const AccountSchema = AccountSettingsSchema.extend({
  key: AccountKeySchema,
  ig_user_id: z.string(),
  /** IG 최신 username. key 와 다르면 핸들이 바뀐 것 — 경고만, 폴더는 그대로. */
  username: z.string(),
  access_token_enc: z.string(),
  token_expires_at: z.string(),
  last_refreshed_at: z.string(),
  status: AccountStatusSchema.default("connected"),
  last_error: z.string().optional(),
  /** /<key>/ 폴더 */
  drive_folder_id: z.string(),
  /** /inbox/<key>/ 폴더 — 매일 지침에 적는 목적지 */
  inbox_folder_id: z.string(),
});
export type Account = z.infer<typeof AccountSchema>;

export const AccountsFileSchema = z.object({
  accounts: z.array(AccountSchema).default([]),
});
export type AccountsFile = z.infer<typeof AccountsFileSchema>;

/** 브라우저로 내려가는 형태. 토큰 없음. */
export const PublicAccountSchema = AccountSchema.omit({ access_token_enc: true });
export type PublicAccount = z.infer<typeof PublicAccountSchema>;
