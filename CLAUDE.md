@AGENTS.md

# Magazine Desk

1인용 Instagram 매거진 CMS. 설계 문서: `docs/01-system-design.md` (PRD보다 우선).

## 절대 규칙
- **DB 없음.** Supabase/Prisma/Drizzle/Postgres/KV/Blob 어떤 것도 추가하지 않는다. 상태는 Google Drive JSON(`_system/*.json`, 포스트 폴더)과 환경변수에만 둔다.
- **로그인/인증 라이브러리 없음.** 접근 제한은 `src/proxy.ts`의 `APP_ACCESS_KEY` 쿠키 검사 하나.
- **모든 Drive JSON은 `src/types/*.ts`의 Zod 스키마로만 읽고 쓴다.** `any` 금지.
- **Drive/Instagram 접근 코드는 `server-only`.** 토큰·시크릿이 클라이언트로 내려가는 경로를 만들지 않는다. 브라우저에는 `username/status/expires_at`만.
- **자동 게시 금지.** 게시는 사용자의 `/api/posts/[id]/publish` 호출로만 시작. 크론은 사용자가 명시적으로 `scheduled`로 둔 것만 실행.
- 캔버스는 1080×1350 논리 좌표 고정, 내보내기는 pixelRatio로 정확히 1080×1350 JPEG.
- 레이아웃 프리셋은 `src/presets/layouts/*.json` 데이터.
- Next.js 16 관례: 요청 API(`cookies/headers/params`)는 `await`, 접근 제한은 `proxy.ts`, 캐싱은 `use cache` 명시, Turbopack. 15 이하 패턴 금지.

## 구조
- `src/lib/drive` — `DriveClient` 인터페이스. `MockDriveClient`(`src/mocks/drive`, 기본) / `GoogleDriveClient`(`DRIVE_CLIENT=google`).
- `src/lib/metadata` — 상태 전이표, 승인 게이트, 포스트 저장/인덱스 재생성.
- `src/lib/ingest` — inbox `.md` + 이미지 → canonical 포스트 폴더.
- `src/lib/instagram`, `src/lib/publish` — Graph API, 게시 흐름.
- `src/app/api/**` — 설계 문서 §10 라우트. `src/app/(desk)/**` — 화면.

## 명령
- `npm run dev` (Mock Drive, 접근 키 없음) · `npm run build` · `npm test` (vitest) · `npm run e2e` (playwright)
