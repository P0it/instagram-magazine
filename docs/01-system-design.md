# Magazine Desk — 기술 스택 & 시스템 설계 (Claude Code 핸드오프)

**Version:** 1.3 · **Date:** 2026-10-20 · **Source of truth:** `instagram-magazine-cms-prd.md`
**용도:** 이 문서를 Claude Code에 그대로 넘겨 프로젝트를 생성한다. PRD와 충돌하면 이 문서가 우선한다.

**v1.1 변경:** DB(Supabase) 완전 제거, 로그인 제거, 개인 용도 Vercel 배포 전제. 상태는 전부 Google Drive + 환경변수에만 둔다.

**v1.2 변경:** 채널 4종 고정(LIFE/MIND/AI/TREND) 폐기. **Instagram 계정 = 채널.** 계정은 OAuth 로 동적으로 추가·해제하고, 키는 연결 시점의 username, Drive 폴더(`/inbox/<username>/`, `/<username>/…`)는 연결 시 자동 생성. `channels.json` 삭제, 채널 설정은 `accounts.json` 항목에 흡수. 상세: `docs/superpowers/specs/2026-09-16-dynamic-accounts-design.md`.

**v1.3 변경 (편집기 확장, Canva·미리캔버스 지향):** 슬라이드에 **자유 레이어**(텍스트·사진·도형)를 여러 개 얹을 수 있다(`SlideLayer.kind` 확장 — 기존 포스트는 변환 없이 그대로). 왼쪽 **도구함**(템플릿·요소·텍스트·사진·업로드·배경), 사진 **보정 확장**(색온도·페이드·비네팅 + 룩 프리셋 8종), 폰트 7→19종, **색 조합** 24종, 내장 **템플릿** 18종 + 내 템플릿(`_system/templates.json`), **레퍼런스 보드**(`/references`, `_system/references.json`, 이미지는 `_system/references/<id>/`), **스톡 사진 검색**(Pexels/Unsplash, 키는 서버 환경변수). DB·로그인은 여전히 없다. 상세는 §15.

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
| 캔버스 | **react-konva** | 폭 1080 × 포스트 규격 높이(4:5 1350 기본 · 3:4 1440 · 1:1 1080 · 1.91:1 566) 논리 좌표, `toDataURL({pixelRatio})`로 결정적 내보내기 |
| 스키마 | **Zod** | 모든 Drive JSON은 Zod로 파싱·기본값 보정 |
| 저장소 | **Google Drive만** (`googleapis` Drive v3, 사용자 OAuth refresh token 또는 서비스 계정) | 콘텐츠 + 앱 상태(계정·잡·인덱스) 전부 Drive의 `_system/` 폴더 |
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

1. **Drive 접근은 사용자 Google 계정(OAuth) 또는 서비스 계정.** (v1.2) 설정 › Google Drive 에서 "Google 계정으로 연결" → 콜백이 refresh token 을 암호화 쿠키로 설정 화면에 한 번 보여주고, 사용자가 `GOOGLE_REFRESH_TOKEN` 환경변수에 넣는다. 토큰을 Drive 에 둘 수 없고(그 토큰으로 Drive 를 연다) 크론은 브라우저 없이 Drive 를 열어야 하므로 환경변수가 유일한 저장소다. 루트 폴더는 내 드라이브의 `/Instagram Magazine` 을 찾거나 만든다. 서비스 계정(폴더 공유 + `GOOGLE_DRIVE_ROOT_FOLDER_ID`)도 계속 지원. 둘 다 있으면 OAuth 우선(`googleAuthMode`).
2. **Inbox + Ingest 계층.** `/inbox/<username>/`에 느슨하게 떨어진 ChatGPT 산출물을 앱이 정규화해 정식 포스트 폴더로 옮긴다. 폴더는 계정 연결 시 자동 생성되므로 매일 지침에는 그 폴더만 목적지로 적으면 된다.
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
             │ OAuth refresh token 또는 서비스 계정 (Drive v3)
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
  /inbox/<username>/                      ← ChatGPT 착지 지점 (계정 연결 시 자동 생성)
  /<username>/{draft,approved,published}/<post-folder>/
  /_system
    accounts.json        ← IG 계정 = 채널 (토큰 암호화 + 채널 설정)
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
  /renders slide_01.jpg …   ← 최종 1080×(규격 높이), 기본 1080×1350
  /_inbox_original/      ← ChatGPT 원본 보존
```

### ChatGPT 예약 작업에 요구할 최소 계약

- 파일명 접두 `YYYY-MM-DD_슬러그`, 이미지는 같은 접두 + `_1.png`, `_2.png`
- 텍스트는 `.md` 하나, front-matter 포함:

```md
---
channel: life.magazine        # 선택 — inbox 폴더가 기준
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
fact_check_required: boolean           // 계정 editorial_rules 에서 파생
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

### `_system/accounts.json` — 계정 = 채널 (`src/types/account.ts`)
```ts
{ accounts: [{
   key: AccountKey,                 // 연결 시점 IG username. 불변. Drive 폴더명 · post.channel 값
   ig_user_id, username,            // username 은 IG 최신값; key ≠ username 이면 핸들 변경 경고
   access_token_enc: string /* AES-256-GCM base64 */,
   token_expires_at, last_refreshed_at,
   status: 'connected'|'expiring'|'expired'|'error', last_error?,
   drive_folder_id, inbox_folder_id, // /<key>/ , /inbox/<key>/ (연결 시 생성)
   // ↓ 채널 설정 (PATCH /api/instagram/accounts/[key] 로만 편집)
   name, color, default_style_pack, default_presets_by_role,
   caption_template, default_hashtags, editorial_rules: { fact_check_required } }] }
```
- OAuth 콜백 = 계정 생성. 같은 `ig_user_id` 재연결이면 토큰·username 만 갱신(키·폴더·설정 보존). 같은 key 를 다른 `ig_user_id` 가 쓰면 `username_taken`.
- 연결 해제는 `accounts.json` 에서만 제거. Drive 폴더·포스트는 남고, 같은 username 으로 재연결하면 폴더를 재사용한다.
- 계정 0개면 ingest·인덱스·인사이트 크론은 no-op, 화면은 "계정을 연결하세요" 빈 상태.

### `_system/index.json`
```ts
{ generated_at, posts: [{ post_id, channel, status, drive_folder_id, headline,
   content_type, cover_thumb_file_id, fact_check_status, scheduled_at,
   created_at, updated_at, warnings: ('status_mismatch'|'missing_render'|…)[] }] }
```

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
- 승인 게이트(서버 강제): renders 수 == slides 수, 각 metadata.format 의 픽셀 크기(기본 1080×1350), caption ≤ 2200, hashtags ≤ 30, `fact_check_required` 계정은 fact_check approved.
- `publishing` 상태에 `locked_at`이 10분 이상 지났으면 stale로 보고 재시도 허용.

---

## 7. 렌더링 (결정적 내보내기)

1. 폰트는 `next/font`로 self-host. 렌더 전 `document.fonts.ready` + `document.fonts.load()` 확인.
2. 이미지는 `/api/drive/file/[id]` same-origin. Konva 필터(Brighten/Contrast/HSL/Blur) + 오버레이 Rect + 그라디언트 Rect.
3. 스테이지는 폭 1080 × 포스트 규격 높이(metadata.format) 고정, 화면은 `scale`만. 내보내기 `stage.toDataURL({ pixelRatio: 1080/displayedWidth, mimeType:'image/jpeg', quality:0.92 })`.
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

## 8b. 인사이트 (M6, 서버 전용 · DB 없음)

앱은 업로더가 아니라 연결된 인스타 계정들의 **피드·성과 관리 페이지**다. 인사이트는 Graph API를 매번 라이브로 부르지 않고 **Drive 스냅샷**으로 쌓는다.

```text
/_system/insights/<account_key>.json
{ account_key, ig_user_id, last_collected_at, last_error,
  days:  [{ date(UTC), followers, reach, views, profile_views }]   ← 하루 1행, 최대 400일
  media: [{ ig_media_id, post_id, views, reach, likes, comments, saves, shares, total_interactions, collected_at }] }
```

- 스코프: `instagram_business_manage_insights` 추가. 계정은 비즈니스/크리에이터(전환 무료).
- 수집(`lib/insights/collect.ts`): 계정당 `GET /{ig-user-id}?fields=followers_count` + `GET /{ig-user-id}/insights?metric=reach,views,profile_views&period=day&metric_type=total_value` (어제 하루) + 최근 60일 published 게시물의 `GET /{ig-media-id}/insights`. 계정 단위로 실패 격리, `last_error` 기록.
- 조회(`lib/insights/summarize.ts`, 순수 함수): 기간(7/28/90) 합계 + 직전 동일 기간 대비, 팔로워는 최신값 vs 직전 기간 말, 게시물당 평균 도달·저장률(saves/reach). index.json과 `post_id`로 조인해 헤드라인·썸네일·채널을 붙인다 → 채널/템플릿별 비교가 가능한 것이 인스타 기본 인사이트와의 차이.
- 화면: 홈 상단 `작업 | 성과` 토글. 성과 = 팔로워·도달·조회·프로필 방문 타일(스파크라인) · 일별 도달 차트 · TOP 게시물(조회/저장/도달/반응) · 계정 간 비교.
- 전략 루프: ChatGPT 일일 태스크가 이 JSON을 읽고 다음 초안의 주제·포맷 비중을 조정한다. 대시보드는 사람이 확인하는 창.
- Mock Drive는 시드 계정(`life.magazine`, `trend.magazine`) × 120일 결정적 스냅샷을 시드한다.

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
| GET/DELETE | `/api/instagram/accounts` | 계정(=채널) 목록(토큰 제외) / 연결 해제(폴더 보존) |
| PATCH | `/api/instagram/accounts/[key]` | 채널 설정 편집. key·ig_user_id·토큰·폴더 id 는 바디에서 무시 |
| POST | `/api/instagram/accounts/mock` | Mock Drive 전용 가짜 연결 (Google 모드 404) |
| GET | `/api/instagram/oauth/start`, `/oauth/callback` | OAuth. 콜백이 username 을 키로 계정+폴더 생성 |
| GET | `/api/google/oauth/start`, `/oauth/callback`, `/oauth/result` | Google Drive 연결. 콜백은 refresh token 을 암호화 쿠키(10분)에 두고, result 가 한 번 읽어 화면에 표시 |
| GET | `/api/cron/publish` | (1.1) `scheduled` 중 run_at ≤ now 실행. Bearer CRON_SECRET |
| GET | `/api/insights?range=7\|28\|90` | (M6) `_system/insights/*.json` 스냅샷 → 계정 요약·시계열·게시물 지표 |
| POST | `/api/insights/collect` | (M6) 사용자가 "지금 수집" — 모든 연결 계정 인사이트 수집 |
| GET | `/api/cron/insights` | (M6) 하루 1회 외부 핑거. Bearer CRON_SECRET |

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
    (desk)/settings/{accounts,style-packs,drive}/
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
PEXELS_API_KEY=                # 선택. 스톡 사진 검색(pexels.com/api, 무료)
UNSPLASH_ACCESS_KEY=           # 선택. 스톡 사진 검색(unsplash.com/developers, 무료)
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
| **M6 인사이트** | `instagram_business_manage_insights`, `_system/insights/*.json` 스냅샷, `/api/cron/insights` 일 1회 수집, 홈 "성과" 탭(타일·추이·TOP 게시물·채널 비교) | 실계정 연결 후 "지금 수집" → 다음 날 팔로워·도달 증감이 표시 |

---

## 15. 편집기 확장 (v1.3)

### 레이어 모델
`SlideEditorState = { image, text, layers[] }` 구조는 그대로다. 메인 텍스트(`text`)와 배경 이미지(`image`)는 슬라이드의 기본 요소로 남고, **추가 요소는 전부 `layers`** 에 쌓인다.

| `layer.kind` | 용도 | 주요 필드 |
|---|---|---|
| `sticker` · `icon` · `cutout` | 기존 요소 | `key`, `text`, `color`, `asset`(누끼) |
| `text` | 자유 텍스트 박스 | `text`, `fontSize`, `fontFamily`, `weight`, `lineHeight`, `letterSpacing`, `align`, `color`, `stroke*`, `shadow` |
| `image` | 사진 레이어 (박스에 cover 크롭) | `asset`, `radius`, `stroke*`, `shadow` |
| `shape` | 도형 (`rect/circle/triangle/star/diamond/line`) | `key`, `color`(채움, `transparent`=없음), `stroke*`, `radius` |

좌표는 기존과 같이 **1080×H 논리 px, (x,y)=박스 중심**. 텍스트 레이어 높이는 내용에서 자동 계산한다(`height` 저장 안 함). 새 필드는 모두 스키마 기본값이 있어 기존 `editor-state.json` 이 그대로 읽힌다.

### 보정
`image.warmth`(−100..100) · `fade`(0..100) · `vignette`(0..100) 추가. 필터는 Konva 커스텀 필터(`src/lib/render/photo-filters.ts`)라 내보내기(스테이지 → JPEG)에 그대로 반영된다. 룩 프리셋은 `src/presets/looks.ts`(색 보정 필드만 덮어쓴다).

### 템플릿
`Template = { design: SlideEditorState(4:5 기준), sample_text, photo, category, source }`. 적용(`applyTemplate`)은 슬라이드의 이미지 보정·메인 텍스트 스타일·레이어를 교체하되, **슬라이드 글과 사용자 사진/누끼 레이어는 유지**하고 포스트 규격으로 y 를 리플로우한다. `photo:false`(색 조합) 템플릿은 배경 사진을 비운다.
- 내장: `src/presets/templates.ts` (코드), 내 템플릿: Drive `_system/templates.json` (`GET/POST /api/templates`, `DELETE /api/templates/[id]`).
- 레퍼런스 → 템플릿: 보드 상세의 "템플릿으로 만들기"가 첫 이미지를 기존 `/api/presets/analyze` 로 읽고 추출 팔레트로 칠해 저장한다(분석 불가 시 색만).

### 레퍼런스 보드
- `Reference = { title, kind(feed|design|palette), account, url, tags[], note, palette[], images[{name,fileId}] }` → Drive `_system/references.json`, 이미지는 `_system/references/<id>/NN.ext`(기존 `/api/drive/file/[id]` 프록시로 서빙).
- 라우트: `GET/POST /api/references`(multipart `meta`+`files`), `PATCH/DELETE /api/references/[id]`, `POST/DELETE /api/references/[id]/images`.
- **수집은 수동**(스크린샷 업로드·⌘V 붙여넣기). Instagram 은 타 계정 데이터를 읽는 공식 API 가 없고 자동 수집은 약관 문제가 있어, 수집부를 이 라우트 뒤에 두고 나중에 교체할 수 있게 한다. 팔레트는 브라우저에서 추출(`src/lib/render/palette.ts`).
- 사업화 단계에서 DB 를 붙일 때는 이 JSON 들을 내려받아 옮긴다(스키마가 `src/types/*.ts` Zod 라 그대로 이관 가능).

### 스톡 사진
`GET /api/stock/search?q=&page=&provider=` · `POST /api/posts/[id]/assets/import`. 키는 `PEXELS_API_KEY` / `UNSPLASH_ACCESS_KEY`(서버 전용, 둘 다 없으면 UI 가 안내만 표시). 이미지 가져오기는 **호스트 허용 목록**(`images.pexels.com`, `images.unsplash.com`)만, Unsplash 는 약관대로 `download_location` 을 호출한다. 고른 사진은 포스트 assets 에 `source_NN` 으로 저장되고 출처가 `sources.json` 의 "참고 출처"에 남는다. 사업화 시에는 각 플랫폼 약관(재배포·경쟁 서비스 금지)을 원문으로 다시 확인할 것.

### AI 생성기 (v1.4)
레퍼런스를 보고 "이걸로 만들어 줘" 하면 완성 수준의 캐러셀을 비동기로 만들어 계정의 `draft` 포스트로 저장한다. 상세 설계·결정: `docs/superpowers/specs/2026-10-21-ai-generator-design.md`, 제공자 조사: `docs/superpowers/notes/2026-10-21-ai-provider-spike.md`.
- **제공자(`AiProvider`)**: Claude = 이 PC 에 로그인된 `claude` CLI(앱은 토큰을 받지 않는다), ChatGPT = 구독 OAuth("Sign in with ChatGPT" 로컬 앱 계약, 콜백은 `127.0.0.1`). 토큰은 `.env.local`(`AI_CHATGPT_TOKENS`, `AI_CHATGPT_HOST_ID`)과 메모리에만. 기본 제공자는 `AI_DEFAULT_PROVIDER`. `AI_CLIENT=mock|real`(미설정이면 `DRIVE_CLIENT` 를 따른다).
- **규약**: `src/presets/spec/{instagram,design}.json` — 캐러셀 장수, 캡션·해시태그 한도, 글자 크기 하한, 역할 순서, 장당 글자 수. 프롬프트(`specPromptBlock`)와 검증기(`validateAgainstSpec`)가 같은 데이터를 쓴다.
- **파이프라인**: 분석(제공자가 이미지를 읽을 때만) → 카피+프리셋 선택 → 규약 검증(위반 시 수정 요청 최대 2회, 그래도 남으면 `warnings` 를 달고 `draft` 저장) → 저장(`index.json` 갱신 포함). AI 호출은 작업당 최대 4회.
- **작업 큐**: Drive `_system/ai-jobs.json`, 한 번에 하나씩, heartbeat 로 중단된 작업을 `failed(interrupted)` 처리. 첨부 사진은 `_system/ai-tmp/<jobId>/` 에 두고 작업이 끝나면 지운다.
- **라우트**: `GET/POST /api/ai/jobs`(multipart `meta`+`files`, 로그인 없으면 401 `ai_not_connected`), `GET /api/ai/jobs/[id]`, `POST /api/ai/jobs/[id]/{cancel,retry}`, `GET /api/ai/providers`, `DELETE|PATCH /api/ai/providers/[provider]`, `GET /api/ai/oauth/chatgpt/{start,callback}`(콜백은 접근 키 검사에서 제외 — 서버 메모리의 state 가 맞아야만 동작).
- **화면**: 설정 > AI, 레퍼런스 상세의 "AI로 생성하기", 상단 바의 AI 작업 표시기·패널.
