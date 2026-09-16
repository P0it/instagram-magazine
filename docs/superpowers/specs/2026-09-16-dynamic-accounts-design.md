# 동적 Instagram 계정 (계정 = 채널) 설계

2026-09-16. `docs/01-system-design.md` v1.1 의 "채널 4종 고정(LIFE/MIND/AI/TREND)" 구조를 폐기하고, Instagram 계정을 OAuth 로 동적으로 추가·관리하는 구조로 바꾼다. 이 문서는 해당 범위에서 시스템 설계 문서보다 우선한다.

## 배경 · 결정

- 현재 `ChannelKeySchema = z.enum(["LIFE","MIND","AI","TREND"])` 가 17개 파일에 퍼져 있고, 설정 화면이 4개 키 버튼을 먼저 보여줘 "계정 4개가 기본값" 처럼 보인다. Instagram 계정 자체(`_system/accounts.json`)는 이미 동적이다.
- **결정 1 — 계정 = 채널.** 개념을 하나로 합친다. `channels.json` 폐기, `accounts.json` 이 단일 진실.
- **결정 2 — 키 = 연결 시점의 Instagram username.** 불변. Drive 폴더명·포스트 메타의 `channel` 값으로 쓴다. 이후 IG 핸들이 바뀌면 경고만 표시하고 폴더는 옮기지 않는다.
- **결정 3 — OAuth 연결이 곧 계정 생성.** 연결 없이 계정을 미리 만들 수 없다. Mock 모드에는 가짜 연결 엔드포인트를 둔다.
- 실 크레덴셜이 아직 없으므로 마이그레이션할 실제 Drive 데이터는 없다. Mock 시드만 바꾼다.

## 운영 흐름 (사용자 관점)

1. 설정 > 계정에서 "Instagram 계정 연결" → OAuth.
2. 콜백이 `inbox/<username>/`, `<username>/{draft,approved,published}/` 폴더를 Drive 에 만들고 계정 카드에 **inbox 폴더 링크**를 보여준다.
3. 사용자는 매일 지침(ChatGPT 등)에 그 inbox 폴더만 목적지로 적는다. 나머지는 기존 ingest → 편집 → 게시 흐름.

## ① 스키마 · 시스템 파일

`src/types/channel.ts` 의 `ChannelConfig` 를 `src/types/account.ts` 로 흡수한다.

```ts
export const AccountKeySchema = z.string().regex(/^[a-z0-9._]{1,30}$/); // IG username 규칙
export type AccountKey = z.infer<typeof AccountKeySchema>;

export const AccountSchema = z.object({
  key: AccountKeySchema,              // 연결 시점 username. 불변. Drive 폴더명.
  ig_user_id: z.string(),
  username: z.string(),               // IG 최신값. key ≠ username 이면 핸들 변경 경고.
  access_token_enc: z.string(),
  token_expires_at: z.string(),
  last_refreshed_at: z.string(),
  status: AccountStatusSchema.default("connected"),
  last_error: z.string().optional(),
  // ↓ 옛 ChannelConfig
  name: z.string(),                   // 기본값 username
  color: z.string().default("#171717"),
  drive_folder_id: z.string(),        // /<key>/
  inbox_folder_id: z.string(),        // /inbox/<key>/
  default_style_pack: z.string().nullable().default(null),
  default_presets_by_role: z.partialRecord(SlideRoleSchema, PresetIdSchema).prefault({}),
  caption_template: z.string().default("{{caption}}\n\n{{hashtags}}"),
  default_hashtags: z.array(z.string()).default([]),
  editorial_rules: z.object({ fact_check_required: z.boolean().default(false) }).default({ fact_check_required: false }),
});

export const AccountsFileSchema = z.object({ accounts: z.array(AccountSchema).default([]) });
export const PublicAccountSchema = AccountSchema.omit({ access_token_enc: true });
export const AccountSettingsPatchSchema = AccountSchema.pick({
  name, color, default_style_pack, default_presets_by_role, caption_template, default_hashtags, editorial_rules,
}).partial();
```

- `ChannelKeySchema`(enum) 와 `CHANNEL_KEYS` 상수 삭제. 모든 사용처를 `AccountKeySchema`/`AccountKey` 로 교체.
- `post.channel`, `IndexEntry.channel`, `insights.channel`, `ingest.channel` 은 **필드명 유지, 타입만 `AccountKey`**. 기존 포스트 JSON 형태 호환.
- `SlideRoleSchema` 는 `src/types/slide-role.ts` 로 분리(channel.ts 삭제에 따른 이동).
- `SystemStatus.channels` 제거. `accounts: PublicAccount[]` 가 설정까지 담는다.
- `src/presets/index.ts` 의 `CHANNEL_DEFAULT_STYLE_PACK`(채널→스타일팩 맵) 삭제. 새 계정 초기값: `default_style_pack = null`, `default_presets_by_role = {}` → 기존 `ROLE_DEFAULT_PRESET` 폴백을 그대로 탄다.
- `approval-gate` 는 이미 `editorial_rules.fact_check_required` 를 읽으므로 로직 변경 없음(읽는 대상만 account).
- `_system/channels.json` 관련 `readChannels/writeChannels` 삭제. 남아 있는 파일은 무시한다.

## ② Drive 경로 · OAuth 생성 흐름

```
/ (DRIVE_ROOT_FOLDER_ID)
├─ _system/accounts.json
├─ inbox/<username>/
└─ <username>/{draft,approved,published}/
```

`src/lib/drive/paths.ts`: `inboxFolderId / channelFolderId / statusFolderId` 시그니처 유지, 타입만 `AccountKey`. `CHANNEL_KEYS` 순회하던 곳(ingest sync, insights cron, index 재생성)은 `listAccounts(drive)` 로 `accounts.json` 을 읽어 순회. 계정 0개면 no-op.

`GET /api/instagram/oauth/start`: `?key=` 제거. state 는 랜덤 토큰만.

`GET /api/instagram/oauth/callback`:
1. code → 단기 → 장기 토큰 → `getMe()` 로 `{ user_id, username }`.
2. `accounts.json` 에서 같은 `ig_user_id` 검색.
   - 있으면 **재연결**: 토큰·`username`·`status` 갱신. `key`·폴더·설정은 그대로.
   - 없으면 **신규**: `key = username`. 같은 key 가 이미 다른 `ig_user_id` 로 존재하면 `?error=username_taken` 으로 실패.
3. 신규면 `ensureFolder(["inbox", key])`, `ensureFolder([key, s])` (draft/approved/published) 생성 후 id 저장. 같은 이름 폴더가 이미 있으면(예전 연결 해제 후 재연결) 그 폴더를 재사용한다 — `ensureFolder` 의 기존 동작.
4. `/settings/accounts?connected=<key>` 리다이렉트.

연결 해제(`DELETE`): `accounts.json` 에서 항목 제거만. Drive 폴더·포스트는 남긴다.

Mock 모드(`DRIVE_CLIENT` ≠ google): `POST /api/instagram/accounts/mock { username }` 이 위 3~4 단계를 가짜 토큰으로 수행. Google 모드에서는 404.

## ③ API

| 변경 | 라우트 | 내용 |
|---|---|---|
| 삭제 | `GET/PUT /api/channels` | `channels.json` 폐기 |
| 유지 | `GET /api/instagram/accounts` | `{ accounts: PublicAccount[], oauth_configured }` |
| 추가 | `PATCH /api/instagram/accounts/[key]` | `AccountSettingsPatchSchema` 로 파싱. 그 외 필드(key/ig_user_id/토큰/폴더 id)는 Zod 에서 strip 되어 변경 불가. `accounts.json` version 비교 후 저장. 없는 key 는 404 |
| 유지 | `DELETE /api/instagram/accounts { key }` | 연결 해제 |
| 추가 | `POST /api/instagram/accounts/mock { username }` | Mock 전용 가짜 연결 |
| 변경 | `GET /api/instagram/oauth/start` | `?key=` 제거 |
| 변경 | `GET /api/instagram/oauth/callback` | ② 흐름 |
| 변경 | `GET /api/system/status` | `channels` 필드 제거 |
| 변경 | `GET /api/posts?channel=` | 값은 username. 미존재 키면 빈 배열 |
| 변경 | ingest sync, `cron/insights`, index 재생성 | 계정 목록 순회 |

## ④ 화면

- **설정 > 계정** (`src/components/settings/accounts.tsx`; `channels.tsx` 삭제·흡수)
  - 계정 카드 목록: `@username` · 이름 · 상태 배지 · 토큰 만료일 · **inbox 폴더 Drive 링크 + 복사 버튼**(`https://drive.google.com/drive/folders/<inbox_folder_id>`; Mock 이면 id 만 표시).
  - 카드 펼침 → 설정 폼(이름·색·기본 스타일팩·역할별 프리셋·캡션 템플릿·기본 해시태그·fact_check 필수). 저장 = `PATCH`.
  - `key !== username` 이면 "Instagram 핸들이 @{username} 으로 바뀌었습니다. 폴더는 @{key} 그대로 사용합니다." 경고.
  - 하단 "Instagram 계정 연결" 버튼 하나 → `/api/instagram/oauth/start`. 키 입력란·4개 프리셋 버튼 삭제. Mock 모드면 username 입력 + "가짜 연결" 버튼.
- **설정 > 채널** 메뉴·페이지(`(desk)/settings/channels`) 삭제.
- **상단바 · 홈 · 인사이트 · 편집기 · 라이브러리**: `src/lib/client/channel.ts` 의 `CHANNEL_META` 삭제 → `useAccounts()`(system status 쿼리)에서 목록·이름·색을 읽는다. `?ch=` 파라미터는 유지하되 값은 username; 없거나 무효면 첫 계정.
- **빈 상태**: 계정 0개면 홈·라이브러리·편집기 진입 시 "Instagram 계정을 연결해 시작하세요 → 설정 > 계정" 안내 한 장. 상단바 채널 셀렉터 숨김.

## ⑤ Mock · 테스트 · 문서

- `src/mocks/seed.ts`: 시드 계정 2개(`life.magazine`, `trend.magazine`). 채널별 팔레트·스타일팩 맵은 시드 로컬 상수로.
- 단위(vitest): `AccountSchema`/`AccountSettingsPatchSchema` 파싱; `PATCH` 가 key·토큰 변경을 무시; 콜백 로직(신규 → 폴더 4개 생성, 재연결 → 폴더·설정 보존, username 충돌 → 실패) — 콜백 본체를 `src/lib/instagram/connect.ts` 로 빼서 `MockDriveClient` 로 테스트.
- e2e(playwright): 계정 0개 빈 상태 → 가짜 연결 → 상단바에 `@username` → 설정 카드에 inbox 링크.
- `docs/01-system-design.md` §5(시스템 파일)·§10(라우트) 및 `CLAUDE.md` 구조 항목 갱신.

## 범위 밖

- IG 핸들 변경 시 폴더·메타 일괄 rename.
- 연결 해제 시 Drive 폴더 삭제.
- 한 계정에 복수 채널(시리즈) 구조.
