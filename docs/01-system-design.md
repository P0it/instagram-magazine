# Magazine Desk — 기술 스택 & 시스템 설계 (Claude Code 핸드오프)

**Version:** 1.1 · **Date:** 2026-09-11 · **Source of truth:** `instagram-magazine-cms-prd.md`
**용도:** 이 문서를 Claude Code에 그대로 넘겨 프로젝트를 생성한다. PRD와 충돌하면 이 문서가 우선한다.

**v1.1 변경:** DB(Supabase) 완전 제거, 로그인 제거, 개인 용도 Vercel 배포 전제. 상태는 전부 Google Drive + 환경변수에만 둔다.

---

## 0. 한 줄 요약

ChatGPT 예약 작업이 Google Drive에 떨어뜨린 초안(텍스트 + 이미지)을 **Next.js 웹앱이 읽어와 정규화 → 편집 → 승인 → Instagram 게시**하는 1인용 에디토리얼 데스크. **저장소는 Google Drive 하나**. 별도 DB 없음, 로그인 없음, 시크릿은 Vercel 환경변수.

---

## 1. 확정 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | **Next.js 16 (최신 16.x, App Router) + React 19 + TypeScript** | Turbopack 기본, `proxy.ts`(구 middleware), `use cache`. Route Handlers/Server Actions로 Drive·IG 호출을 서버에 가둠 |
| 스타일 | **Tailwind CSS v4 + shadcn/ui** | 절제된 에디토리얼 UI |
| 서버 상태 | **TanStack Query v5** | Drive 목록·포스트 캐시, 낙관적 갱신 |
| 에디터 상태 | **Zustand + Immer** (undo/redo) | 캔버스 편집은 클라이언트 로컬 상태 |
| 캔버스 | **react-konva** | 1080×1350 논리 좌표, `toDataURL({pixelRatio})`로 결정적 내보내기 |
| 스키마 | **Zod** | 모든 Drive JSON은 Zod로 파싱·기본값 보정 |
| 저장소 | **Google Drive만** (`googleapis` Drive v3, 서비스 계정) | 콘텐츠 + 앱 상태(계정·잡·인덱스) 전부 Drive의 `_system/` 폴더 |
| 접근 제한 | **`proxy.ts` + 접근 키 쿠키** (환경변수 1개) | 로그인 화면 없음. `/?key=…` 한 번 열면 쿠키 저장, 이후 자유 |
| Instagram | **Instagram API with Instagram Login (Graph API)** | 비밀번호 수집 없음, 장기 토큰(60일) + refresh |
| IG 이미지 공개 URL | **자체 서명 URL 라우트** `/api/public/[token]` (HMAC, 30분 만료) | 외부 스토리지 없이 Drive 렌더를 IG가 읽을 수 있게 중계 |
| 배포 | **Vercel Hobby** | |
| 스케줄 게시 | MVP 제외 → 1.1에서 **외부 핑거(cron-job.org 등) → `/api/cron/publish`** | Vercel Hobby 크론은 하루 1회·2개 제한이라 5분 폴링 불가 |
| 테스트 | Vitest (스키마·프리셋·상태전이·인제스트 파서) + Playwright 스모크 | |

### DB 없이 가는 방식 정리

| 원래 DB에 두려던 것 | 대체 |
|---|---|
| IG 계정·토큰 | `_system/accounts.json` (토큰은 `APP_ENCRYPTION_KEY`로 AES-GCM 암호화해 저장) |
| 게시 잡 큐 | 없음. `metadata.json`의 `status`/`scheduled_at`/`publish` 블록이 곧 잡 상태. 크론은 `approved` 폴더를 스캔 |
| 포스트 인덱스 캐시 | `_system/index.json` (동기화 시 재생성) + Next `use cache`(60s) |
| 스타일팩 | `_system/style-packs/*.json` |
| 인제스트 로그 | `_system/ingest-log.json` (최근 200건 롤링) |
| 로그인 세션 | 없음. 접근 키 쿠키만 |

### 결정 사항(PRD 대비)

1. **Drive 접근은 서비스 계정.** 루트 폴더를 서비스 계정 이메일에 "편집자"로 공유. 사용자 OAuth 없음 → refresh token 만료 이슈 없음.
2. **Inbox + Ingest 계층.** `/inbox/<CHANNEL>/`에 느슨하게 떨어진 ChatGPT 산출물을 앱이 정규화해 정식 포스트 폴더로 옮긴다.
3. **IG 공개 이미지 URL은 자체 라우트로 중계.** `proxy.ts`에서 `/api/public/*`만 접근 키 검사에서 제외하고, 대신 HMAC 서명 토큰 + 만료로 보호.
4. **Konva 이미지 소스는 same-origin 프록시**(`/api/drive/file/[id]`)로만 로드 (canvas taint 방지).
5. **동시성은 낙관적 락으로.** 1인 사용이므로 `metadata.updated_at` 비교 + Drive 파일 `version`만 확인.

---

## 2. 시스템 아키텍처

```text
┌──────────────────────────┐
│ ChatGPT Scheduled Task   │  매일: 리서치 → 카피/캡션/이미지
└────────────┬─────────────┘
             │ Drive 커넥터 업로드 (형식 느슨)
             ▼
┌───────────────────────────────────────────────────────────┐
│ Google Drive  (유일한 저장소)                               │
│  /Instagram Magazine/inbox/<CH>/…                          │
│  /Instagram Magazine/<CH>/{draft,approved,published}/<post>│
│  /Instagram Magazine/_system/{accounts,index,ingest-log}.json, style-packs/ │
└────────────┬──────────────────────────────────────────────┘
             │ 서비스 계정 (Drive v3)
             ▼
┌───────────────────────────────────────────────────────────┐
│ Magazine Desk (Next.js 16 on Vercel Hobby)                 │
│  proxy.ts : 접근 키 쿠키 검사 (/api/public/*, /api/cron/* 제외) │
│  lib/drive     list · read · write · move · file proxy      │
│  lib/ingest    inbox → 정규화 → draft                        │
│  lib/metadata  Zod 스키마 · 상태 전이 · 정합성                 │
│  lib/instagram OAuth · 컨테이너 · publish · refresh          │
│  lib/publish   게시 실행 · 재시도 · 서명 URL 발급              │
│  Client: Dashboard · Library · Editor(Konva) · Preview · Publish │
└──────┬─────────────────────────────┬──────────────────────┘
       │ 서명 URL(/api/public/…)로 렌더 제공 │
       ▼                             ▼
┌─────────────────────┐    ┌──────────────────────────┐
│ Instagram Graph API │◀───│ 외부 핑거 (1.1, 선택)      │
│  container→publish  │    │ cron-job.org → /api/cron/* │
└─────────────────────┘    └──────────────────────────┘
```

---

## 3. Google Drive 구조 (최종)

```text
/Instagram Magazine                      ← GOOGLE_DRIVE_ROOT_FOLDER_ID
  /inbox/{LIFE,MIND,AI,POEM}/            ← ChatGPT 착지 지점
  /LIFE/{draft,approved,published}/<post-folder>/
  /MIND …  /AI …  /POEM …
  /_system
    channels.json        ← 채널 설정
    accounts.json        ← IG 계정 (토큰 암호화)
    index.json           ← 포스트 인덱스 캐시 (재생성 가능)
    ingest-log.json      ← 최근 인제스트 결과
    /style-packs/*.json
```

### 포스트 폴더 (정규화 후 canonical)

```text
/2026-09-11_youth-housing-support
  metadata.json          ← PRD §6 + 아래 확장
  sources.json           ← PRD §7
  visual-brief.json      ← PRD §8
  editor-state.json      ← 에디터 전체 상태(좌표·톤·크롭). 재편집용
  /assets  source_01.jpg …
  /renders slide_01.jpg …   ← 최종 1080×1350
  /_inbox_original/      ← ChatGPT 원본 보존
```

### ChatGPT 예약 작업에 요구할 최소 계약

- 파일명 접두 `YYYY-MM-DD_슬러그`, 이미지는 같은 접두 + `_1.png`, `_2.png`
- 텍스트는 `.md` 하나, front-matter 포함:

```md
---
channel: LIFE
content_type: carousel
topic: 청년 월세 지원
headline: "월세 내고 있다면\n이번 주 이건 확인"
hashtags: [청년정책, 월세지원]
sources:
  - {title: "...", url: "...", publisher: "...", source_type: official}
visual_direction: "quiet editorial, dark photo, white sans-serif"
---
## slide 1 (cover)
월세 내고 있다면
이번 주 이건 확인
## slide 2 (info)
...
## caption
...
```

---

## 4. Ingest(정규화) 파이프라인

```text
/inbox/<CH>/* 스캔
  → 접두로 그룹핑
  → front-matter → PostMetadata (Zod .partial + defaults, 부분 파싱 허용)
  → "## slide N (role)" → slides[] ; "## caption" → caption
  → 이미지 → assets/source_0N.ext, slides[i].asset 매핑
  → sources.json (fact_check_status: pending), visual-brief.json (없으면 채널 기본)
  → 채널 기본 프리셋 부여 (cover: large-editorial, info: info-dark, closing: closing-slide …)
  → /<CH>/draft/<post-folder>/ 생성, 원본은 _inbox_original/ 이동
  → index.json upsert, ingest-log.json 기록
실패/필수값 누락 → status: needs_repair 로 생성 + 경고
```

- 트리거: 상단 바 "Drive 새로고침" 버튼(수동). 앱을 열 때 마지막 동기화가 30분 이상 지났으면 자동 1회.
- 멱등성: `ingest-log.json`의 `source_fingerprint`(파일 id + md5) 로 중복 스킵.

---

## 5. 데이터 모델 (전부 Drive JSON, `src/types/*.ts` Zod)

### `PostMetadata` — PRD §6 + 확장

```ts
status: 'needs_repair'|'draft'|'approved'|'scheduled'|'publishing'|'published'|'failed'
fact_check_required: boolean           // 채널 규칙에서 파생 (LIFE=true)
asset_mode: 'official'|'stock'|'screenshot'|'generated'|'upload'|'text_only'
publish?: {                            // 잡 테이블 대체
  account_key: string
  mode: 'immediate'|'scheduled'
  run_at?: string
  attempt: number, max_attempts: 3
  last_error?: string, locked_at?: string
  ig_creation_id?: string, ig_media_id?: string, published_at?: string
}
```

### `SlideDef`
```ts
{ id, role: 'cover'|'photo'|'info'|'quote'|'screenshot'|'closing',
  text, asset?: string|null, style_preset: PresetId, overrides?: Partial<LayoutPreset> }
```

### `EditorState` (editor-state.json)
슬라이드별 `{ image: {crop, zoom, pan, brightness, contrast, saturation, overlay, gradient, blur}, text: {x, y, width, fontSize, weight, lineHeight, letterSpacing, align, color, locked} }`

### `_system/accounts.json`
```ts
{ accounts: [{ key: 'life', ig_user_id, username,
   access_token_enc: string /* AES-256-GCM base64 */,
   token_expires_at, last_refreshed_at,
   status: 'connected'|'expiring'|'expired'|'error' }] }
```

### `_system/index.json`
```ts
{ generated_at, posts: [{ post_id, channel, status, drive_folder_id, headline,
   content_type, cover_thumb_file_id, fact_check_status, scheduled_at,
   created_at, updated_at, warnings: ('status_mismatch'|'missing_render'|…)[] }] }
```

### `_system/channels.json`
`[{ key, name, color, drive_folder_id, default_style_pack, default_presets_by_role, instagram_account_key, caption_template, default_hashtags, editorial_rules: {fact_check_required} }]`

### `LayoutPreset` (`src/presets/layouts/*.json`) — PRD §9 10종
`{ id, textPlacement, defaultFontSize, textWidthRatio, maxLines, safeMargin, toneDefaults, align }`

---

## 6. 상태 머신 & 정합성

```text
needs_repair → draft            운영자 수정 저장
draft → approved                승인 게이트 통과 시
approved → draft                반려
approved → scheduled            예약 등록 (publish.mode=scheduled, run_at)
scheduled → approved            예약 취소
approved|scheduled → publishing → published   IG 성공 시에만 폴더 이동
publishing → failed             IG 실패; 폴더 이동 없음, 재시도 가능
failed → approved               재시도 준비
```

- 폴더 위치 ≠ `metadata.status` → `warnings: ['status_mismatch']`, 복구 다이얼로그에서 "폴더 기준 / 메타 기준" 선택.
- 승인 게이트(서버 강제): renders 수 == slides 수, 각 1080×1350, caption ≤ 2200, hashtags ≤ 30, LIFE는 fact_check approved.
- `publishing` 상태에 `locked_at`이 10분 이상 지났으면 stale로 보고 재시도 허용.

---

## 7. 렌더링 (결정적 내보내기)

1. 폰트는 `next/font`로 self-host. 렌더 전 `document.fonts.ready` + `document.fonts.load()` 확인.
2. 이미지는 `/api/drive/file/[id]` same-origin. Konva 필터(Brighten/Contrast/HSL/Blur) + 오버레이 Rect + 그라디언트 Rect.
3. 스테이지 1080×1350 고정, 화면은 `scale`만. 내보내기 `stage.toDataURL({ pixelRatio: 1080/displayedWidth, mimeType:'image/jpeg', quality:0.92 })`.
4. 저장 시 렌더 → `PUT /api/posts/[id]/renders` → Drive `/renders/slide_NN.jpg` 덮어쓰기 + editor-state/metadata 갱신.

---

## 8. Instagram 게시 흐름 (서버 전용)

```text
publish(post):
  1. metadata.status='publishing', publish.locked_at=now (낙관적 락)
  2. 렌더마다 서명 URL 발급: /api/public/{hmac(post_id, slide, exp)}  (30분)
  3. 단일:   POST /{ig-user-id}/media { image_url, caption, alt_text?, location_id? }
     캐러셀: 슬라이드마다 POST /media { image_url, is_carousel_item:true }
             → POST /media { media_type:'CAROUSEL', children:[…], caption }
  4. GET /{creation_id}?fields=status_code → FINISHED 까지 폴링 (최대 60s)
  5. POST /{ig-user-id}/media_publish { creation_id } → media_id
  6. metadata: status='published', publish.ig_media_id, published_at → 폴더 /published 이동 → index.json 갱신
실패: attempt++, last_error 기록, status='failed'. 재시도는 사용자가 큐 화면에서 수동(또는 1.1 크론)
```

- `/api/public/[token]`: 토큰 검증 → Drive에서 파일 스트리밍. 만료·서명 불일치 시 404. `proxy.ts` 접근 키 검사 제외 경로.
- 즉시 게시는 Server Action에서 동기 실행(Vercel 함수 제한 내: Hobby 기본 최대 60s → `maxDuration = 60` 설정, 캐러셀 10장도 보통 수십 초 내 완료. 초과 시 `failed`로 남기고 재시도 안내).
- 토큰 갱신: 앱을 열 때 `accounts.json`을 읽어 만료 7일 이내면 `refresh_access_token` 호출 후 저장. 크론 불필요.
- 일일 게시 한도(Meta 정책, 계정당 24h 기준·현재 100건 전후 — 구현 시 공식 문서 확인)는 `index.json`의 최근 24h `published_at` 카운트로 표시.
- 브라우저에는 `username`, `status`, `expires_at`만 내려간다. 토큰은 절대 응답에 포함하지 않음.

---

## 9. 접근 제한 (로그인 없음)

- Vercel 환경변수 `APP_ACCESS_KEY` 하나.
- `proxy.ts`: 쿠키 `md_key`가 `APP_ACCESS_KEY`의 HMAC과 일치하면 통과. 없으면 `?key=`를 확인해 일치 시 HttpOnly·Secure 쿠키(1년) 설정 후 리다이렉트. 불일치면 404 페이지(앱 존재를 드러내지 않음).
- 제외 경로: `/api/public/*`(서명 토큰 자체가 인증), `/api/cron/*`(`Authorization: Bearer CRON_SECRET`).
- 북마크: `https://<app>.vercel.app/?key=…` 를 휴대폰·PC에 한 번씩 열면 끝.
- 대안: Vercel Deployment Protection("Vercel Authentication")도 가능하지만 `/api/public/*`까지 막혀 IG가 이미지를 못 가져오므로 **채택하지 않음**.

---

## 10. API / Server Actions

| 메서드 | 경로 | 역할 |
|---|---|---|
| GET | `/api/posts?channel=&status=&from=&to=&type=` | index.json 기반 조회 |
| GET | `/api/posts/[id]` | metadata + sources + visual-brief + editor-state |
| PUT | `/api/posts/[id]` | metadata/editor-state 저장 (Zod, updated_at 낙관적 락) |
| PUT | `/api/posts/[id]/renders` | 렌더 업로드 (multipart) |
| POST | `/api/posts/[id]/assets` | 이미지 업로드/교체 |
| POST | `/api/posts/[id]/transition` | `{to}` 상태 전이 + 폴더 이동 |
| POST | `/api/posts/[id]/repair` | status_mismatch 복구 |
| POST | `/api/posts/[id]/publish` | `{account_key, mode, run_at?}` 즉시 게시 또는 예약 표시 |
| POST | `/api/posts/[id]/retry` | failed → 재게시 |
| GET | `/api/drive/file/[fileId]` | 이미지 프록시 (루트 하위 검증, ETag, private cache) |
| GET | `/api/public/[token]` | IG용 서명 URL (접근 키 제외) |
| POST | `/api/ingest/sync` | inbox 정규화 + index.json 재생성 |
| GET/POST/DELETE | `/api/instagram/accounts`, `/oauth/start`, `/oauth/callback` | 계정 연결/해제 |
| GET | `/api/cron/publish` | (1.1) `scheduled` 중 run_at ≤ now 실행. Bearer CRON_SECRET |

---

## 11. 프로젝트 구조

```text
src/
  proxy.ts                        ← 접근 키 검사
  app/
    (desk)/layout.tsx             ← 상단 바(로고·채널 탭·동기화·큐·설정)
    (desk)/home/  publish/[postId]/  queue/  settings/   (dashboard·library 는 /home 리다이렉트)
    (builder)/layout.tsx          ← 빌더는 자체 헤더 (상단 바 없음)
    (builder)/editor/[postId]/
    (desk)/settings/{accounts,channels,style-packs,drive}/
    api/…                         ← §10
  components/ shell/{TopBar}  md/{Segmented,StageBadge,…Montage 프리미티브}  home/{HomeBoard}
              editor/{Canvas,LeftPanel,StageArea,RightPanel,SlideStrip,PreviewMode}
              preview/{FeedPreview,GridPreview}  publish/{PublishSheet,PublishPage,ApprovalChecklist}  ui/
  lib/ drive/ ingest/ metadata/ instagram/ publish/ render/ crypto/ access/
  presets/ layouts/*.json  styles/*.json
  stores/ editor-store.ts
  types/ *.ts (Zod)
  mocks/ posts/                   ← M1용 더미 Drive 폴더
```

---

## 12. 환경 변수 (Vercel)

```env
NEXT_PUBLIC_APP_NAME=Magazine Desk
APP_BASE_URL=
APP_ACCESS_KEY=                # 접근 키 (긴 랜덤 문자열)
APP_ENCRYPTION_KEY=            # 32B base64, accounts.json 토큰 암호화 + 서명 URL HMAC
CRON_SECRET=                   # 1.1 외부 핑거용
GOOGLE_SERVICE_ACCOUNT_JSON=   # base64
GOOGLE_DRIVE_ROOT_FOLDER_ID=
META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=
```

`GOOGLE_CLIENT_ID/SECRET`, `DATABASE_URL`, `SUPABASE_*`, `AUTH_SECRET` 는 **없음**.

---

## 13. 보안 · 운영 원칙

- Drive/IG 접근은 `server-only` 모듈에서만. 클라이언트는 `/api/*`·Server Action만 호출.
- 이미지 프록시는 루트 폴더 하위 파일만(부모 체인 검증 후 결과 캐시).
- 자동 게시 금지: 게시는 사용자의 `/publish` 호출로만 시작. 크론은 사용자가 명시적으로 `scheduled`로 둔 것만 실행.
- Drive 쓰기는 "임시 파일 업로드 → 이름 교체"로 원자성. `_system/*.json`은 읽기-수정-쓰기 시 Drive `version` 필드 비교.
- `index.json`은 언제든 삭제해도 다음 동기화에서 재생성되는 캐시로 취급(원본 아님).

---

## 14. 개발 마일스톤

| M | 범위 | 완료 기준 |
|---|---|---|
| **M1 정적 프로토타입** | 프로젝트 생성, 셸/채널 스위처, Dashboard·Library(mock), Editor(Konva, 프리셋 10종, 이미지/텍스트 패널), 캐러셀 스트립, Feed/Grid 미리보기, 클라이언트 렌더 다운로드 | mock 포스트 편집·프리셋 전환·리오더·1080×1350 JPEG 내보내기 |
| **M2 Drive** | 서비스 계정, `_system/index.json`, 이미지 프록시, 저장, 렌더 업로드, 상태 전이·폴더 이동, Inbox 인제스트, `proxy.ts` 접근 키 | ChatGPT가 inbox에 넣은 파일이 draft 카드로 나타나고 편집 저장이 Drive에 반영 |
| **M3 Instagram** | Meta OAuth → `accounts.json`(암호화), 서명 URL 라우트, 즉시 게시(단일+캐러셀), published 전이 | 실제 계정에 캐러셀 게시 후 폴더가 /published로 이동 |
| **M4 폴리시** | 실패/재시도 UX, 토큰 만료 경고·재연결, status_mismatch 복구, 승인 체크리스트, 예약 게시(`/api/cron/publish` + 외부 핑거) | 예약 포스트가 정시(±5분)에 게시 |
| **M5 스타일팩** | style-pack.json 임포터, 채널 기본값 적용, 로컬 Claude Code 레퍼런스 분석 스크립트 | 스타일팩 선택 시 프리셋 기본값이 바뀜 |
