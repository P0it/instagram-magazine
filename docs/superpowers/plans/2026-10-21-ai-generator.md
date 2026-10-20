# AI 생성기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 레퍼런스·템플릿 상세에서 지침을 주면 Claude/ChatGPT 구독 로그인으로 완성 수준의 캐러셀을 비동기로 생성해 계정의 `draft` 포스트로 저장한다.

**Architecture:** `AiProvider` 인터페이스(Claude, ChatGPT, Mock) 뒤에 OAuth/CLI 연결을 숨긴다. 생성은 `analyst → copywriter(카피+프리셋 선택) → 규약 검증·수정(최대 2회) → 저장` 파이프라인이고, `_system/ai-jobs.json` 큐를 단일 러너가 한 번에 하나씩 처리한다. 규약(spec)은 JSON 데이터이며 프롬프트와 검증기가 같은 파일을 쓴다.

**Tech Stack:** Next.js 16.3 (App Router, `proxy.ts`), TypeScript, Zod 4, TanStack Query 5, vitest 5(`tests/unit/**`), Playwright, Google Drive JSON(`MockDriveClient` 테스트).

**Spec:** `docs/superpowers/specs/2026-10-21-ai-generator-design.md`

## Global Constraints

- DB 없음(Supabase/Prisma/Drizzle/Postgres/KV/Blob 금지). 상태는 Drive JSON(`_system/*.json`)과 `.env.local`뿐.
- 로그인/인증 라이브러리 추가 금지. 접근 제한은 `src/proxy.ts`의 `APP_ACCESS_KEY` 쿠키 하나.
- AI·Drive·토큰 코드는 `import "server-only"`. 브라우저에는 `provider / connected / kind / account / expires_at / supports_images / last_error`만.
- 모든 Drive JSON과 모델 응답은 `src/types/*.ts` Zod 스키마로만 읽고 쓴다. `any` 금지.
- 캔버스 폭 1080, 높이는 포스트 규격(`metadata.format`: 4:5 1350 · 3:4 1440 · 1:1 1080 · 1.91:1 566, 기본 4:5).
- 자동 게시 금지: 생성물은 항상 `draft`. 크론으로 생성하지 않는다.
- 한 작업의 AI 호출 최대 6회. 수정 요청 최대 2회. 한 번에 한 작업만 실행.
- 토큰 저장은 `.env.local`뿐(Drive·로그·브라우저 금지). 메모리 캐시가 1차, 쓰기는 단일 잠금 안에서만.
- Next.js 16: 요청 API(`cookies/headers/params`)는 `await`. 코드 작성 전에 `node_modules/next/dist/docs/`의 관련 문서를 읽는다.
- 한국어 UI 문구. 기존 컴포넌트·스타일(`src/components/md/*`, `SettingsSection/SettingsRow`)을 재사용한다.
- 작업 트리에 이 기능과 무관한 미커밋 변경이 많다. 각 task는 **자기 파일만** `git add` 한다. 커밋 메시지 끝에 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

사용자가 쓰다 실제로 맞닥뜨릴 가능성이 높은 순서. 각 줄의 테스트는 소유 task에 있다.

1. **작업 도중 로그인 만료/한도 초과** → 작업은 `failed`, 실패 단계와 사람이 읽을 수 있는 이유(`kind: "auth" | "quota"`)를 남기고 설정 안내. 조용히 멈추면 안 됨. (Task 9)
2. **AI가 규약을 어긴 응답**(없는 프리셋 id, 장수 범위 밖, 깨진/잘린 JSON, 코드펜스 포함) → 스키마 파싱 실패는 수정 요청 1회로 센다. 그래도 안 되면 `failed`. (Task 3, 8)
3. **긴 한글·이모지·공백 없는 긴 단어**가 든 문구 → 넘침 추정이 보수적으로 위반 판정하고 수정 요청이 간다. 그래도 위반이면 `warnings`를 달고 `draft`로 완료. (Task 2, 8)
4. **생성 중 앱 재시작/계정 해제/레퍼런스 삭제** → `running` 작업은 heartbeat 만료 시 `failed(interrupted)`, 계정·레퍼런스가 없으면 시작 단계에서 `failed(not_found)`. 임시 첨부 폴더는 어떤 종료에서도 지운다. (Task 7, 9)
5. **생성 버튼 연타·동시 요청, 실행 중 취소** → 큐에 순서대로 쌓이고 하나씩 실행, 취소는 다음 AI 호출 전에 반영되며 부분 결과로 포스트를 만들지 않는다. (Task 9)

---

### Task 1: 제공자 가능성 확인 (스파이크, 조사 전용)

OAuth 구독 토큰이 제3자 클라이언트로 쓰이는지를 확인해 이후 Task 5의 방식을 확정한다. **제품 코드를 만들지 않는다.** Task 2~4, 6~12는 Mock으로 병행 가능하고 Task 5만 이 결과를 기다린다.

**Files:**
- Create: `docs/superpowers/notes/2026-10-21-ai-provider-spike.md`

**Produces:** 노트 파일에 제공자(`claude`, `chatgpt`)마다 아래 필드를 채운다. Task 5가 이 값을 그대로 쓴다.
`connection`(`oauth` | `cli`), `authorize_url`, `token_url`, `client_id`, `scopes`, `redirect_uri`(고정 포트 여부 포함), `api_base`, `required_headers`, `model_ids`(생성용/분석용), `supports_images`(true/false), `refresh_rotates`(refresh token이 갱신 때 바뀌는가), `evidence`(링크·재현 명령).

- [ ] **Step 1: 조사.** 공개 문서와 각 CLI(`claude`, `codex`)의 공개 소스·`--help`·릴리스 노트로 OAuth 방식(PKCE 여부, 엔드포인트, 스코프, 콜백)을 확인한다. **`~/.claude`, `~/.codex`, 키체인의 자격증명 파일은 열어 보지 않는다.**
- [ ] **Step 2: 실호출 확인.** 사용자에게 `!` 명령으로 각 제공자 로그인을 하게 한 뒤, 최소 스크립트(`scripts/spike-ai.ts`, 커밋하지 않음)로 토큰 교환 → 한 줄 응답 요청 → 이미지 1장 포함 요청을 시도해 결과를 노트에 적는다. 거부되면 어떤 오류인지 그대로 적는다.
- [ ] **Step 3: 판정.** 스펙의 규칙대로 결정: 거부된 제공자는 `connection: cli`(`claude -p` / `codex exec`), 된 제공자는 `oauth`. CLI 방식의 이미지 입력 방법(임시 파일 경로 전달 등)도 적는다.
- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/notes/2026-10-21-ai-provider-spike.md
git commit -m "docs(ai): 구독 OAuth 제공자 가능성 확인 결과"
```

---

### Task 2: 타입 — 제공자·작업·생성 결과·포스트 `generation`

**Files:**
- Create: `src/types/ai.ts`
- Modify: `src/types/post.ts` (PostMetadataSchema에 `generation` 선택 필드), `src/types/index.ts` (export)
- Test: `tests/unit/ai-schemas.test.ts`

**Produces (정확한 이름):**
```ts
AiProviderIdSchema = z.enum(["claude", "chatgpt"])            // type AiProviderId
AiConnectionKindSchema = z.enum(["oauth", "cli"])
AiProviderStatusSchema   // { id, connected, kind, account?, expires_at?, supports_images, last_error? }
AiJobStatusSchema = z.enum(["queued","running","done","failed","canceled"])
AiJobStageSchema  = z.enum(["analyze","copy","layout","review","save"])   // layout=프리셋 선택 후처리, review=규약 검증
AiJobErrorKindSchema = z.enum(["auth","quota","not_found","invalid_output","interrupted","internal"])
AiJobInputSchema  // { account_key, reference_id?, template_id?, brief: string.max(4000), format: PostFormatSchema.default("4:5"), slide_count?: int 3..10, attachment_count: int }
AiJobSchema       // { id:"job-…", status, stage, input, post_id?, error?:{stage,kind,message}, owner?, heartbeat_at?, calls: int, created_at, updated_at }
AiJobsFileSchema  // { jobs: AiJob[] }
GeneratedSlideSchema    // { role: SlideRoleSchema, text: string, preset: PresetIdSchema, overrides?: LayoutPresetOverridesSchema, attachment?: int }
GeneratedCarouselSchema // { headline, topic, caption, hashtags: string[], alt_text?: string, slides: GeneratedSlide[] }
GenerationInfoSchema    // { reference_id?, template_id?, brief, provider: AiProviderIdSchema, spec_version: string, generated_at }
```
`PostMetadataSchema`에 `generation: GenerationInfoSchema.optional()`을 추가하고 `PostMetadataPatchSchema`에는 넣지 않는다(클라이언트가 못 바꾼다).

- [ ] **Step 1: 실패하는 테스트 작성** — `ai-schemas.test.ts`: (a) `AiJobInputSchema.parse({account_key:"a", brief:"x", attachment_count:0}).format === "4:5"`, (b) `slide_count: 2`/`11` 거부, (c) `GeneratedCarouselSchema`가 `preset: "nope"` 거부, (d) 기존 `metadata.json`(generation 없음)이 `PostMetadataSchema.parse`를 그대로 통과, (e) `generation`이 있는 메타데이터 왕복.
- [ ] **Step 2: 실패 확인** — `npx vitest run tests/unit/ai-schemas.test.ts` → FAIL (모듈 없음).
- [ ] **Step 3: `src/types/ai.ts` 구현**, `post.ts`·`index.ts` 수정. `schema_version`은 올리지 않는다.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, 그리고 `npx vitest run` 전체와 `npm run typecheck`가 깨지지 않음.
- [ ] **Step 5: Commit** — `git add src/types/ai.ts src/types/post.ts src/types/index.ts tests/unit/ai-schemas.test.ts` · `feat(ai): 제공자·작업·생성 결과 타입`

---

### Task 3: 규약(spec) 데이터와 검증기

**Files:**
- Create: `src/presets/spec/instagram.json`, `src/presets/spec/design.json`, `src/lib/ai/spec.ts`
- Test: `tests/unit/ai-spec.test.ts`

**Interfaces:**
- Consumes: `GeneratedCarousel`, `PostFormat`, `FORMAT_INFO`, `PRESET_IDS`, `CAPTION_MAX`, `HASHTAG_MAX`(`src/lib/metadata/approval-gate.ts` — 값을 복제하지 말고 import).
- Produces:
```ts
export const SPEC_VERSION: string                      // instagram.json 의 version
export interface Spec { version: string; instagram: {...}; design: {...} }
export function loadSpec(): Spec                       // 두 JSON 을 Zod 로 검증해 합친다
export type SpecViolation = { slide?: number; code: "slide_count"|"overflow"|"font_too_small"|"caption_too_long"|"hashtag_count"|"empty_text"|"role_order"; message: string }
export function estimateLines(text: string, fontSize: number, boxWidth: number): number   // 보수적 추정(Review Focus 3)
export function validateAgainstSpec(c: GeneratedCarousel, format: PostFormat, spec?: Spec): SpecViolation[]
export function specPromptBlock(format: PostFormat, spec?: Spec): string  // 프롬프트에 삽입할 규약 요약
```
JSON 값(장수 범위 2~10, 캡션 2200, 해시태그 30, 폰트 크기 하한, 장당 글자 수 상한, 역할 순서 규칙 cover→…→closing)은 각 값에 `source`(근거 URL 또는 "프로젝트 규칙")를 단다. 수치는 JSON이 진실이고 이 task에서 조사해 채운다. 캡션·해시태그 한도는 `approval-gate.ts` 값과 같아야 한다(테스트로 고정).

- [ ] **Step 1: 실패하는 테스트** — (a) `loadSpec()`이 에러 없이 로드되고 `instagram.caption_max === CAPTION_MAX`, (b) 정상 3장 캐러셀 → 위반 `[]`, (c) 1장·11장 → `slide_count`, (d) 공백 없는 60자 한글 헤드라인을 폭 좁은 프리셋에 → `overflow`, (e) 이모지 섞인 긴 문장이 `estimateLines`에서 이모지를 2칸으로 센다, (f) 해시태그 31개 → `hashtag_count`, (g) 빈 `text` → `empty_text`, (h) `specPromptBlock("4:5")`에 `1350`이 들어 있다.
- [ ] **Step 2: 실패 확인** — `npx vitest run tests/unit/ai-spec.test.ts` → FAIL.
- [ ] **Step 3: JSON 두 개 작성**(근거 조사 포함)과 `spec.ts` 구현. `estimateLines`는 글자 종류(한글·전각=1em, 영문·숫자≈0.55em, 이모지=2em, 공백 줄바꿈 불가 구간은 단어 단위 끊기 없이 글자 단위)로 폭을 누적하고 애매하면 한 줄 더 센다. 프리셋의 텍스트 박스 폭·글자 크기는 `resolvePreset`(`src/presets`)에서 가져온다.
- [ ] **Step 4: 통과 확인** — PASS + 전체 vitest.
- [ ] **Step 5: Commit** — `feat(ai): Instagram 규격·디자인 규약 데이터와 검증기`

---

### Task 4: 제공자 계층 — 인터페이스·토큰 저장소·Mock·레지스트리

**Files:**
- Create: `src/lib/ai/provider/types.ts`, `src/lib/ai/provider/token-store.ts`, `src/lib/ai/provider/registry.ts`, `src/lib/ai/provider/json-reply.ts`, `src/mocks/ai/MockAiProvider.ts`
- Modify: `src/lib/env.ts` (`AI_CLIENT: "mock"|"real"` — 미설정이면 `DRIVE_CLIENT`를 따름, `AI_DEFAULT_PROVIDER`), `src/lib/google/local-env.ts`는 건드리지 않고 `upsertEnvLine`만 import
- Test: `tests/unit/ai-provider.test.ts`

**Interfaces — Produces:**
```ts
export class AiError extends Error { kind: AiJobErrorKind }          // auth|quota|invalid_output|internal
export interface AiRequest<S extends z.ZodTypeAny> { system: string; user: string; images?: {mime:"image/png"|"image/jpeg"|"image/webp"; bytes:Uint8Array}[]; schema: S; signal?: AbortSignal }
export interface AiProvider {
  id: AiProviderId; kind: AiConnectionKind; supportsImages: boolean;
  status(): Promise<AiProviderStatus>;
  complete<S extends z.ZodTypeAny>(req: AiRequest<S>): Promise<z.output<S>>;   // 스키마 검증까지 끝낸 값. 실패 시 AiError
}
// token-store.ts
export interface AiTokens { access: string; refresh: string; expires_at: string; account?: string }
export function getTokens(id: AiProviderId): AiTokens | null
export function setTokens(id: AiProviderId, t: AiTokens): Promise<void>   // 단일 잠금 → .env.local 쓰기 성공 후 캐시 갱신. 쓰기 실패 시 throw AiError("auth")
export function clearTokens(id: AiProviderId): Promise<void>
export function parseTokenEnv(raw: string): AiTokens | null               // base64url(JSON) + Zod
export function encodeTokenEnv(t: AiTokens): string
// json-reply.ts
export function extractJson(text: string): unknown                         // 코드펜스·앞뒤 설명 제거, 못 찾으면 AiError("invalid_output")
// registry.ts
export function getProvider(preferred?: AiProviderId): Promise<AiProvider>  // 설정 기본값 → 연결된 쪽. 없으면 AiError("auth")
export function listProviderStatus(): Promise<AiProviderStatus[]>
export function setDefaultProvider(id: AiProviderId): Promise<void>        // .env.local AI_DEFAULT_PROVIDER
```
환경변수 키: `AI_CLAUDE_TOKENS`, `AI_CHATGPT_TOKENS`(값은 `encodeTokenEnv`), `AI_DEFAULT_PROVIDER`.
`MockAiProvider`: 큐된 응답 배열을 순서대로 돌려주고 호출 기록(`calls`)을 남긴다. 생성자 `new MockAiProvider({ id?, replies: unknown[] , supportsImages? })`.

- [ ] **Step 1: 실패하는 테스트** — (a) `encodeTokenEnv`↔`parseTokenEnv` 왕복, 깨진 값은 `null`, (b) `extractJson`이 ```` ```json ```` 펜스·앞뒤 설명이 붙은 응답에서 객체를 꺼내고 잘린 JSON은 `AiError.kind === "invalid_output"`, (c) `setTokens` 동시 두 번 호출이 직렬화되고(임시 파일로 순서 검증) 파일 쓰기 실패 시 캐시가 바뀌지 않음, (d) Mock `complete`가 스키마 불일치 응답에 `invalid_output`, (e) `getProvider()`가 둘 다 연결이면 기본값을, 한쪽이면 그쪽을, 없으면 `auth`를 반환.
- [ ] **Step 2: 실패 확인** — `npx vitest run tests/unit/ai-provider.test.ts` → FAIL.
- [ ] **Step 3: 구현.** `token-store`는 모듈 레벨 Promise 체인으로 잠금을 구현하고 `upsertEnvLine`·`resetEnvCache`를 재사용한다. 쓰기 파일 경로는 인자(`file = path.join(process.cwd(), ".env.local")`)로 받아 테스트에서 임시 파일을 쓴다. `isLocalDev()`가 아니면 쓰기는 `AiError("auth")`.
- [ ] **Step 4: 통과 확인** — PASS + 전체 vitest + typecheck.
- [ ] **Step 5: Commit** — `feat(ai): AiProvider 인터페이스, 토큰 저장소, Mock 제공자`

---

### Task 5: 실제 제공자와 OAuth 로그인 라우트 (Task 1 결과 필요)

**Files:**
- Create: `src/lib/ai/provider/pkce.ts`, `src/lib/ai/provider/claude.ts`, `src/lib/ai/provider/chatgpt.ts`, `src/lib/ai/provider/cli.ts`, `src/app/api/ai/oauth/[provider]/start/route.ts`, `src/app/api/ai/oauth/[provider]/callback/route.ts`, `src/app/api/ai/providers/route.ts`, `src/app/api/ai/providers/[provider]/route.ts`
- Modify: `src/lib/ai/provider/registry.ts` (실제 제공자 등록), `src/proxy.ts`는 건드리지 않음(기존 접근 제한이 `/api/ai/**`에도 적용되는지 확인만)
- Test: `tests/unit/ai-oauth.test.ts`

**Interfaces:**
- Consumes: Task 1 노트의 제공자별 값(`connection`, 엔드포인트, 스코프, 헤더, 모델), `setTokens/getTokens/clearTokens`, `AiProvider`, `extractJson`.
- Produces:
```ts
// pkce.ts
export function makePkce(): { verifier: string; challenge: string; state: string }
// claude.ts / chatgpt.ts — Task 1 의 connection 값에 따라 OAuth 또는 cli.ts 위임
export function createClaudeProvider(deps?: { fetch?: typeof fetch; now?: () => number }): AiProvider
export function createChatgptProvider(deps?: { fetch?: typeof fetch; now?: () => number }): AiProvider
// cli.ts
export function createCliProvider(id: AiProviderId, deps?: { exec?: typeof execFile }): AiProvider   // claude -p / codex exec, 이미지는 임시 파일 경로로 전달 후 삭제
```
라우트:
- `GET /api/ai/oauth/[provider]/start` → PKCE 생성, `verifier/state`를 `httpOnly` 쿠키(10분)에 담아 인가 URL로 리디렉션. 기존 `src/app/api/google/oauth/start/route.ts` 패턴을 따른다. 제공자가 고정 포트 콜백만 허용하면 그 포트로 일시 리스너를 여는 대신 설정 화면에 안내를 띄운다(Task 1 결과 기준).
- `GET /api/ai/oauth/[provider]/callback` → state 검증, 토큰 교환, `setTokens`, `/settings/ai`로 리디렉션. 실패는 `?error=`.
- `GET /api/ai/providers` → `listProviderStatus()` (`{providers: AiProviderStatus[], default: AiProviderId|null}`).
- `DELETE /api/ai/providers/[provider]` → `clearTokens`. `PATCH` → `{default: AiProviderId}`.
응답에는 토큰 문자열이 절대 들어가지 않는다.

- [ ] **Step 1: 실패하는 테스트** — 주입한 가짜 `fetch`로: (a) 만료 60초 전이면 자동 갱신하고 `setTokens`에 새 refresh가 저장됨(`refresh_rotates` true인 경우), (b) 401은 한 번 갱신 후 재시도하고 그래도 401이면 `AiError("auth")`, (c) 429는 지수 백오프 재시도(가짜 타이머), 한도 초과 본문은 재시도 없이 `AiError("quota")`, (d) `status()`가 토큰 없으면 `connected:false`, 있으면 `account/expires_at`만 담고 토큰 문자열을 포함하지 않음(JSON.stringify 결과에 access/refresh 값이 없음), (e) `makePkce().challenge`가 verifier의 S256, (f) callback이 state 불일치를 거부, (g) `createCliProvider`가 가짜 `exec`로 임시 이미지 파일을 만들고 호출 후 지움.
- [ ] **Step 2: 실패 확인** — `npx vitest run tests/unit/ai-oauth.test.ts` → FAIL.
- [ ] **Step 3: 구현.** 응답은 모두 `req.schema`로 검증해 반환한다(`extractJson` → `schema.safeParse`, 실패는 `invalid_output`). 가능성 확인에서 `supports_images:false`로 판정된 제공자는 `supportsImages=false`.
- [ ] **Step 4: 통과 확인** — PASS + 전체 vitest + typecheck.
- [ ] **Step 5: 수동 확인(자동화하지 않음)** — `npm run dev`에서 각 제공자 로그인 → `/api/ai/providers`가 `connected:true`, 응답 JSON에 토큰이 없음, 해제 후 `connected:false`. 결과를 PR 설명에 적는다.
- [ ] **Step 6: Commit** — `feat(ai): Claude·ChatGPT 구독 로그인 제공자와 OAuth 라우트`

---

### Task 6: 설정 > AI 화면

**Files:**
- Create: `src/app/(desk)/settings/ai/page.tsx`, `src/components/settings/ai.tsx`
- Modify: `src/components/settings/settings-shell.tsx`(TABS에 "AI" 추가), `src/lib/client/api.ts`(`aiProviders`, `aiLogout`, `aiSetDefault`), `src/lib/client/queries.ts`(`qk.aiProviders`, `useAiProviders`, `useAiLogout`, `useAiSetDefault`)
- Test: `tests/unit/nav-items.test.ts`는 영향 없음. 새 e2e는 Task 12.

**Interfaces:**
- Consumes: `GET/PATCH/DELETE /api/ai/providers…`, `/api/ai/oauth/[provider]/start`.
- Produces: `useAiProviders(): UseQueryResult<{providers: AiProviderStatus[]; default: AiProviderId|null}>`, `AiSettings` 컴포넌트.

- [ ] **Step 1: 구현.** 제공자마다 `SettingsRow`: 로고/이름, 상태(연결됨·계정·만료 시각, 연결 방식 `OAuth`/`CLI`), 버튼(로그인 → `/api/ai/oauth/<id>/start`로 이동, 로그아웃), 기본 제공자 선택, 마지막 오류, `supports_images:false`면 "이미지를 읽지 못해요" 안내. `?error=`는 토스트. 토큰 값은 어떤 화면에도 없다.
- [ ] **Step 2: 확인** — `npm run typecheck`, `npm run lint`, `npm run dev`(Mock)에서 `/settings/ai`가 두 제공자를 보여 주고 기본 제공자 변경이 반영됨을 브라우저로 확인(또는 Task 12 e2e로 대체).
- [ ] **Step 3: Commit** — `feat(ai): 설정 AI 탭`

---

### Task 7: 생성 포스트 저장 — 기존 정규화 코드에서 폴더 쓰기 분리

**Files:**
- Create: `src/lib/ingest/write-post.ts`, `src/lib/ai/generate/save.ts`
- Modify: `src/lib/ingest/normalize.ts`(꼬리의 폴더·파일 쓰기를 `write-post.ts`로 추출해 호출)
- Test: `tests/unit/ai-save.test.ts` (+ 기존 `tests/unit/ingest.test.ts`, `stage.test.ts`가 계속 통과)

**Interfaces:**
- Produces:
```ts
// write-post.ts — normalizeGroup 의 5번 이후(metadata.json, editor.json, sources.json, visual-brief.json 쓰기)를 그대로 옮긴다
export async function writeNewPost(drive: DriveClient, folder: {folderId:string}, input: { metadata: PostMetadata; editorSlides: EditorState["slides"]; format: PostFormat }): Promise<void>
// save.ts
export async function saveGeneratedPost(drive: DriveClient, account: Account, carousel: GeneratedCarousel, opts: {
  format: PostFormat; generation: GenerationInfo; attachments: { name: string; bytes: Uint8Array; mime: string }[]; warnings: string[]; now?: Date
}): Promise<{ postId: string; folderId: string }>
```
`saveGeneratedPost`: 폴더명은 `<YYYY-MM-DD>_<slugify(topic||headline)>`(충돌 시 `-2`…, `normalizeGroup`과 같은 규칙), 슬라이드의 `attachment` 인덱스가 가리키는 이미지**만** `assets/`에 `source_0N.ext`로 저장(Review Focus 4), `style_preset`은 `GeneratedSlide.preset`, `overrides`는 그대로, `slideStateFromPreset(resolvePreset(...), text)`로 편집 상태 생성, `status:"draft"`, `asset_mode`는 이미지가 있으면 `"upload"` 없으면 `"text_only"`, `generation` 채움, `warnings` 기록, 계정의 `default_hashtags`를 해시태그에 합치지 **않는다**(AI가 낸 것을 그대로, 중복 제거만).

- [ ] **Step 1: 실패하는 테스트**(`MockDriveClient`) — (a) 3장 캐러셀 저장 → `/<account>/draft/<postId>/metadata.json`이 `PostMetadataSchema`를 통과하고 `generation.provider`가 있음, (b) 첨부 3개 중 슬라이드가 `attachment:1`만 가리키면 `assets/`에 1개만 있음, (c) 같은 날 같은 주제 두 번 → 폴더명 `-2`, (d) `status === "draft"`.
- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: 리팩터링 먼저** — `write-post.ts` 추출 후 `npx vitest run tests/unit/ingest.test.ts tests/unit/stage.test.ts`가 변경 전과 같이 통과하는지 확인. 그 다음 `save.ts` 구현.
- [ ] **Step 4: 통과 확인** — PASS + 전체 vitest + typecheck.
- [ ] **Step 5: Commit** — `feat(ai): 생성 결과를 draft 포스트로 저장, 정규화 쓰기 로직 분리`

---

### Task 8: 역할 프롬프트와 생성 파이프라인

**Files:**
- Create: `src/lib/ai/roles/analyst.ts`, `src/lib/ai/roles/copywriter.ts`, `src/lib/ai/roles/delivery.ts`, `src/lib/ai/generate/pipeline.ts`
- Test: `tests/unit/ai-pipeline.test.ts`

**Interfaces:**
- Consumes: `AiProvider.complete`, `loadSpec/specPromptBlock/validateAgainstSpec`, `saveGeneratedPost`, `readReferences`/`listReferences`, `LAYOUT_PRESETS`, `BUILTIN_TEMPLATES`(`src/presets/templates.ts`), `ReferenceInsightSchema`, `getDrive`.
- Produces:
```ts
// analyst.ts — 기존 insight 가 없고 이미지가 있을 때만 호출(이미지 못 읽는 제공자는 건너뜀: 텍스트 메타만으로 진행)
export function buildAnalystPrompt(ref: Reference, hasImages: boolean): { system: string; user: string }
export const AnalystOutputSchema        // ReferenceInsightDraftSchema + { suggested_presets: PresetId[] }
// copywriter.ts — 카피와 프리셋 선택을 한 호출로
export function buildCopyPrompt(i: { brief: string; format: PostFormat; slideCount?: number; insight?: ReferenceInsightDraft; template?: Template; accountTone?: string; attachmentCount: number }): { system: string; user: string }   // 응답 스키마 = GeneratedCarouselSchema
// delivery.ts — 규약 위반 수정 요청
export function buildRepairPrompt(carousel: GeneratedCarousel, violations: SpecViolation[]): { system: string; user: string }
// pipeline.ts
export interface PipelineHooks { onStage(stage: AiJobStage): Promise<void>; onCall(): Promise<void>; signal?: AbortSignal }
export async function runGeneration(input: AiJobInput, attachments: {name:string;bytes:Uint8Array;mime:string}[], hooks: PipelineHooks, deps?: { provider?: AiProvider; drive?: DriveClient }): Promise<{ postId: string }>
```
동작: `analyze`(필요할 때만) → `copy`(1회) → `layout`(응답을 `GeneratedCarouselSchema`로 파싱, 없는 프리셋 id·`attachment` 범위 밖 인덱스는 위반으로 처리) → `review`(`validateAgainstSpec` 위반이 있으면 `buildRepairPrompt`로 최대 2회 수정. 스키마 파싱 실패도 1회로 침) → `save`. 호출 때마다 `hooks.onCall()`(한도 6 초과 시 수정 중단 후 현재 결과로 `warnings` 달고 저장). `hooks.signal.aborted`면 다음 호출 전에 `AiError`가 아닌 `CanceledError`를 던진다. 계정·레퍼런스·템플릿을 못 찾으면 `AiError("not_found")`.

- [ ] **Step 1: 실패하는 테스트**(`MockAiProvider`, `MockDriveClient`) — (a) 정상 응답 1개 → 호출 1회, 포스트 저장, `onStage` 순서가 `copy,layout,review,save`, (b) 첫 응답이 위반(헤드라인 넘침) → 수정 응답으로 통과, 호출 2회, (c) 위반이 계속 → 호출 3회(수정 2회) 후 `warnings`에 위반 메시지가 담긴 `draft` 저장(실패 아님), (d) 첫 응답이 코드펜스+설명 포함 JSON → 통과, (e) 없는 프리셋 id → 수정 요청 1회, (f) 이미지 못 읽는 제공자 + insight 없음 → analyze 건너뛰고 완료, (g) `signal` abort → 저장 없이 `CanceledError`, (h) 존재하지 않는 `reference_id` → `not_found`, (i) 호출 6회 한도.
- [ ] **Step 2: 실패 확인** — `npx vitest run tests/unit/ai-pipeline.test.ts` → FAIL.
- [ ] **Step 3: 구현.** 프롬프트는 시스템 메시지에 `specPromptBlock`, 허용 프리셋 id 목록과 각 프리셋의 용도·텍스트 박스 폭·권장 글자 수, "JSON만, 코드펜스 금지", 레퍼런스의 구조·톤은 "그대로 베끼지 말고 구성만 따르라"를 넣는다. 모델 ID는 `claude-opus-5` 같은 상수로 provider 쪽에 둔다(Task 1 노트의 `model_ids`).
- [ ] **Step 4: 통과 확인** — PASS + 전체 vitest + typecheck.
- [ ] **Step 5: Commit** — `feat(ai): 분석·카피·검수 역할과 생성 파이프라인`

---

### Task 9: 비동기 작업 큐와 API

**Files:**
- Create: `src/lib/ai/jobs/store.ts`, `src/lib/ai/jobs/queue.ts`, `src/lib/ai/jobs/runner.ts`, `src/app/api/ai/jobs/route.ts`, `src/app/api/ai/jobs/[id]/route.ts`, `src/app/api/ai/jobs/[id]/cancel/route.ts`, `src/app/api/ai/jobs/[id]/retry/route.ts`
- Modify: `src/lib/drive/system-files.ts`(`readAiJobs`, `writeAiJobs`), `src/lib/drive/paths.ts`(필요 시 `_system/ai-tmp/<jobId>/` 헬퍼), `src/lib/api/respond.ts`(필요 시 에러 매핑)
- Test: `tests/unit/ai-jobs.test.ts`

**Interfaces:**
- Consumes: `runGeneration`, `AiJob*` 스키마, `readSystemJson/writeSystemJson` 버전 충돌 처리.
- Produces:
```ts
export async function enqueueJob(input: AiJobInput, files: File[]): Promise<AiJob>      // 첨부는 _system/ai-tmp/<id>/ 에 저장 후 kickRunner()
export async function listJobs(): Promise<AiJob[]>                                       // 최신순, 목록을 읽을 때 stale running 정리
export async function getJob(id: string): Promise<AiJob>
export async function cancelJob(id: string): Promise<AiJob>                              // queued 면 즉시 canceled, running 이면 취소 플래그 → 다음 호출 전에 반영
export async function retryJob(id: string): Promise<AiJob>                               // failed/canceled 만. 새 job 을 만든다(첨부가 지워졌으면 400)
export function kickRunner(): void                                                       // globalThis 단일 러너. 이미 돌고 있으면 무시
export const HEARTBEAT_MS = 15_000; export const STALE_AFTER_MS = 120_000
```
API: `POST /api/ai/jobs`(multipart `{ meta: JSON(AiJobInput), files }`, 계정·장수·형식 검증, 로그인 없으면 `401 code:"ai_not_connected"`), `GET /api/ai/jobs`, `GET /api/ai/jobs/[id]`, `POST …/cancel`, `POST …/retry`. 작업 JSON에는 첨부 바이트·토큰이 없다. 임시 첨부 폴더는 성공·실패·취소 어느 쪽이든 러너가 끝낼 때 지운다. 작업 수는 최근 100건만 유지(오래된 완료 건 정리). 수명 동안 `calls`를 기록.

- [ ] **Step 1: 실패하는 테스트**(`MockDriveClient`, `MockAiProvider`) — (a) enqueue → 러너가 `queued→running→done`을 거치고 `post_id`가 채워지며 `stage`가 순서대로 갱신, (b) 동시에 3개 enqueue → 동시에 실행되는 작업은 최대 1개, 도착 순서대로 완료, (c) 제공자가 `AiError("auth")`를 던지면 `failed`, `error.kind==="auth"`, `error.stage` 기록, (d) `running`인데 `heartbeat_at`이 `STALE_AFTER_MS`보다 오래되면 `listJobs`가 `failed(interrupted)`로 정리(가짜 시간), (e) running 중 `cancelJob` → `canceled`, 포스트 미생성, 임시 폴더 삭제, (f) 계정이 없으면 `failed(not_found)`, (g) `retryJob`이 새 id를 만들고 원본은 유지, 첨부 없는 입력은 첨부 없이 재시도, (h) 모든 종료 경로에서 `_system/ai-tmp/<id>/`가 비어 있음, (i) `POST /api/ai/jobs` 응답 JSON에 `bytes`·토큰 문자열이 없음.
- [ ] **Step 2: 실패 확인** — `npx vitest run tests/unit/ai-jobs.test.ts` → FAIL.
- [ ] **Step 3: 구현.** 러너는 `globalThis.__magazineDeskAiRunner` 한 개(HMR 중복 방지), 시작 시 `owner`=프로세스 시작 시 생성한 id, 작업 쓰기는 `VersionConflictError`가 나면 재읽기 후 재시도. `next dev` 재시작으로 끊긴 작업은 Review Focus 4의 규칙으로만 정리한다(서버 시작 훅에 의존하지 않음).
- [ ] **Step 4: 통과 확인** — PASS + 전체 vitest + typecheck.
- [ ] **Step 5: Commit** — `feat(ai): 비동기 생성 작업 큐와 API`

---

### Task 10: 생성 화면 — "AI로 생성하기", 진행 표시, 작업 목록

**Files:**
- Create: `src/components/ai/generate-dialog.tsx`, `src/components/ai/jobs-indicator.tsx`, `src/components/ai/jobs-panel.tsx`
- Modify: `src/lib/client/api.ts`(`aiJobs`, `aiCreateJob`, `aiCancelJob`, `aiRetryJob`), `src/lib/client/queries.ts`(`qk.aiJobs`, `useAiJobs`, `useCreateAiJob`, `useCancelAiJob`, `useRetryAiJob`), `src/components/references/reference-detail.tsx`(버튼), 템플릿 상세 컴포넌트(`src/components/templates/` 안의 상세 뷰, 버튼), `src/components/shell/sidebar.tsx`(표시기 마운트)
- Test: `tests/unit/ai-jobs-ui.test.ts`(순수 함수만: 단계 라벨, 진행률 계산), e2e는 Task 12

**Interfaces:**
- Consumes: `/api/ai/jobs…`, `useAccountList()`, `useAiProviders()`.
- Produces:
```ts
export const STAGE_LABEL: Record<AiJobStage, string>      // 분석·카피·레이아웃·검수·저장 (한국어)
export function jobProgress(job: AiJob): { index: number; total: 5; label: string }   // src/components/ai/job-progress.ts
export function useAiJobs(): UseQueryResult<{ jobs: AiJob[] }>   // 실행/대기 중이 있으면 2초, 없으면 15초 폴링
export function GenerateDialog(props: { open: boolean; onOpenChange(o: boolean): void; source: { kind: "reference"; id: string; title: string } | { kind: "template"; id: string; title: string } }): JSX.Element
```
GenerateDialog: 계정 선택(`useAccountList`, 현재 선택 계정 기본), 규격(기본 4:5, `FORMAT_INFO.hint`), 장수(자동 또는 3~10), 지침 textarea(최대 4000자), 이미지 첨부(선택, 이미지 파일만, 최대 6개·개당 10MB — 초과 시 입력 단계에서 거부). 로그인이 안 돼 있으면 모달 본문 대신 "설정에서 AI 로그인"을 안내(`/settings/ai` 링크). 제출하면 닫히고 토스트 "생성을 시작했어요". 결과는 한 번에 — 스트리밍 없음. 표시기: 진행 중 개수와 현재 단계, 클릭하면 패널(상태, 실패 이유와 설정 안내, 취소·다시 시도, 완료 건의 포스트 링크). 완료되면 `["posts"]` 쿼리를 무효화해 `/home` 보드에 나타나게 한다. 포스트 카드에 `generation`이 있으면 "AI 생성" 표시(홈 보드 카드 컴포넌트에 작은 배지).

- [ ] **Step 1: 실패하는 테스트** — `jobProgress`: `queued`→index 0, `stage:"review"`→index 3 label "검수", `done`→index 5, `failed`는 마지막 stage 유지.
- [ ] **Step 2: 실패 확인** — `npx vitest run tests/unit/ai-jobs-ui.test.ts` → FAIL.
- [ ] **Step 3: 구현** — 위 컴포넌트와 연결. 레이아웃·모양은 구현 전에 사용자에게 목업(브라우저 시각화)으로 한 번 확인한다: 다이얼로그, 사이드바 표시기, 작업 패널 세 가지.
- [ ] **Step 4: 통과 확인** — PASS, `npm run typecheck`, `npm run lint`, `npm run dev`(Mock)에서 상세 → 생성 → 표시기 진행 → `/home`에 draft 확인.
- [ ] **Step 5: Commit** — `feat(ai): AI로 생성하기 다이얼로그, 진행 표시, 작업 패널`

---

### Task 11: 문서·규칙 갱신

**Files:**
- Modify: `CLAUDE.md`(절대 규칙 두 문장 — "AI 제공자 토큰은 `.env.local`에만", "AI 호출은 `AiProvider` 계층(`src/lib/ai/provider`)을 거친다. 기존 `layout-analyst`/`reference-analyst`는 이전 전까지 예외"), `docs/01-system-design.md`(AI 생성기 절 추가: 큐, `_system/ai-jobs.json`, 라우트 목록)
- 확인: 스펙 문서 "예외 요청" 두 항목이 반영됐는지

- [ ] **Step 1: 수정** — 위 문구 반영. 코드 구조 절의 `src/lib/ai` 항목도 갱신.
- [ ] **Step 2: Commit** — `docs(ai): CLAUDE.md·시스템 설계에 AI 생성기 규칙 반영`

---

### Task 12: e2e와 최종 검증

**Files:**
- Create: `tests/e2e/ai-generate.spec.ts`

**Interfaces:** Mock 모드(`AI_CLIENT=mock`)에서 `MockAiProvider`가 고정 캐러셀 응답을 돌려주는 시드를 쓴다. 시드는 `src/mocks/ai/MockAiProvider.ts`의 기본 응답(스키마 통과·규약 통과 3장)을 재사용한다.

- [ ] **Step 1: e2e 작성** — (a) `/settings/ai`에서 두 제공자 상태 표시와 기본 제공자 변경, (b) 레퍼런스 상세 → "AI로 생성하기" → 지침 입력 → 제출 → 사이드바 표시기에 진행 → 완료 후 `/home`에 새 draft 카드와 "AI 생성" 배지, (c) 제공자 미연결 상태에서 다이얼로그가 설정 안내를 보여 줌, (d) 같은 지침 두 번 제출해도 두 번째는 대기 후 순서대로 완료.
- [ ] **Step 2: 실행** — `npm run e2e -- tests/e2e/ai-generate.spec.ts` PASS.
- [ ] **Step 3: 전체 검증** — `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` 모두 통과 (출력 확인 후에만 완료로 보고).
- [ ] **Step 4: Commit** — `test(ai): AI 생성 e2e`
