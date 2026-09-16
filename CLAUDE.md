@AGENTS.md

# Magazine Desk

1인용 Instagram 매거진 CMS. 설계 문서: `docs/01-system-design.md` (PRD보다 우선).

## 절대 규칙
- **DB 없음.** Supabase/Prisma/Drizzle/Postgres/KV/Blob 어떤 것도 추가하지 않는다. 상태는 Google Drive JSON(`_system/*.json`, 포스트 폴더)과 환경변수에만 둔다.
- **로그인/인증 라이브러리 없음.** 접근 제한은 `src/proxy.ts`의 `APP_ACCESS_KEY` 쿠키 검사 하나.
- **계정 = 채널, 고정 채널 없음.** Instagram 계정은 OAuth 로 동적으로 추가된다(`src/lib/instagram/connect.ts`). 키는 연결 시점 username, Drive 폴더 `/inbox/<key>/`·`/<key>/…` 는 연결 시 자동 생성. 채널 enum·`CHANNEL_META`·`channels.json` 같은 하드코딩을 다시 만들지 않는다. 계정 목록은 서버 `listAccounts()`, 클라이언트 `useAccountList()`.
- **모든 Drive JSON은 `src/types/*.ts`의 Zod 스키마로만 읽고 쓴다.** `any` 금지.
- **Drive/Instagram 접근 코드는 `server-only`.** 토큰·시크릿이 클라이언트로 내려가는 경로를 만들지 않는다. 브라우저에는 `username/status/expires_at`만.
- **자동 게시 금지.** 게시는 사용자의 `/api/posts/[id]/publish` 호출로만 시작. 크론은 사용자가 명시적으로 `scheduled`로 둔 것만 실행.
- 캔버스는 폭 1080 고정, 높이는 **포스트 규격**(`metadata.format`: 4:5 1350 · 3:4 1440 · 1:1 1080 · 1.91:1 566, 기본 4:5)을 따른다. 내보내기는 pixelRatio로 그 규격 픽셀 그대로 JPEG. 규격은 슬라이드가 아니라 포스트 단위(캐러셀은 같은 비율).
- AI 호출은 서버(`src/lib/ai`)에서만. 스크린샷 분석은 `@anthropic-ai/sdk`(ANTHROPIC_API_KEY) → 없으면 로컬 `claude -p`(구독) 순. 배경 제거는 브라우저 안(`@imgly/background-removal`), 외부 키 없음.
- 레이아웃 프리셋은 `src/presets/layouts/*.json` 데이터.
- Next.js 16 관례: 요청 API(`cookies/headers/params`)는 `await`, 접근 제한은 `proxy.ts`, 캐싱은 `use cache` 명시, Turbopack. 15 이하 패턴 금지.

## 구조
- `src/lib/drive` — `DriveClient` 인터페이스. `MockDriveClient`(`src/mocks/drive`, 기본) / `GoogleDriveClient`(`DRIVE_CLIENT=google`).
- `src/lib/metadata` — 상태 전이표, 승인 게이트, 포스트 저장/인덱스 재생성.
- `src/lib/ingest` — inbox `.md` + 이미지 → canonical 포스트 폴더.
- `src/lib/instagram` — Graph API, `accounts.ts`(목록·설정 PATCH·해제), `connect.ts`(OAuth → 계정+폴더 생성). `src/lib/publish` — 게시 흐름.
- `src/app/api/**` — 설계 문서 §10 라우트. `src/app/(desk)/**` — 화면.

## 명령
- `npm run dev` (Mock Drive, 접근 키 없음) · `npm run build` · `npm test` (vitest) · `npm run e2e` (playwright)
