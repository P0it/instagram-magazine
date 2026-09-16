# Magazine Desk

1인용 Instagram 매거진 에디토리얼 데스크. ChatGPT 예약 작업이 Google Drive `inbox/` 에 떨어뜨린 초안을 **읽어와 정규화 → Konva 편집 → 승인 → Instagram 게시**한다.

- 저장소는 **Google Drive 하나**. DB 없음, 로그인 없음. 시크릿은 Vercel 환경변수.
- Next.js 16 (App Router, `proxy.ts`, `use cache`) + React 19 + Tailwind v4 + shadcn/ui + TanStack Query + Zustand + react-konva + Zod.
- 설계 문서: [`docs/01-system-design.md`](docs/01-system-design.md)

## 로컬 실행 (Mock Drive)

```bash
npm install
cp .env.example .env.local      # 기본값: DRIVE_CLIENT=mock, APP_ACCESS_KEY 비움
npm run dev                     # http://localhost:3000 → /home
```

Mock 모드는 인메모리 Drive 에 시드 계정 2개(`life.magazine`, `trend.magazine`)와 계정별 샘플 포스트(draft/approved/published/failed/scheduled/needs_repair)와 inbox 샘플(.md + .png)이 시드된다. 상단 바의 **Drive 새로고침**을 누르면 inbox 샘플이 "초안" 카드로 나타난다. 서버 재시작 시 초기화.

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest (스키마·프리셋·상태전이·승인게이트·인제스트·암호화·Mock Drive·게시 흐름)
npm run e2e         # playwright: 홈 3단계 보드 → 빌더 → 프리셋 전환(자동 저장) → 스티커 → 1080×1350 JPEG → 게시 시트 게이트 → 게시 기록 화면
npm run build
```

## 화면

| 경로 | 역할 |
|---|---|
| `/home` | 채널별 홈 보드. 화면에 보이는 파이프라인은 **초안 → 편집 중 → 게시됨** 3단계뿐(`src/lib/metadata/stage.ts` 매핑). 게시됨 탭은 프로필 그리드. `/dashboard`·`/library` 는 여기로 리다이렉트 |
| `/editor/[postId]` | 빌더. 좌: 프리셋(내장 10 + **스크린샷으로 만든 내 프리셋**) / 요소(스티커·아이콘·**밈 누끼**) / 레이어, 중앙: Konva 캔버스(폭 1080, 높이는 **포스트 규격** 4:5·3:4·1:1·1.91:1) + 선택 툴바 + 안전 영역 + 줌, 우: 텍스트(폰트 7종)·이미지·요소·포스트 패널, 하단 슬라이드 스트립. **자동 저장**(1.5s) + 유휴 렌더(12s), undo/redo, 미리보기, **게시 바텀시트** |
| `/publish/[postId]` | 게시 기록 · 승인 체크리스트(서버 강제) · 상태 전이 · status_mismatch 복구 · 재게시 · 그리드 미리보기 |
| `/queue` | publishing / scheduled / failed / approved 목록, 재시도, 예약 취소 (상단 바 아이콘) |
| `/settings/*` | 계정 · 채널(OAuth 연결/해제, inbox 폴더 링크, 채널 설정), 스타일팩(임포트·계정 기본값), Drive·시스템 |

## AI · 브라우저 처리

- **스크린샷 → 프리셋** (`POST /api/presets/analyze`): 마음에 든 피드 스크린샷을 올리면 비전 모델이 텍스트 위치·크기·정렬·톤을 읽어 "기본 프리셋 + 오버라이드"로 만들고, 이름을 붙여 `_system/custom-presets.json` 에 저장한다. 호출 순서는 `ANTHROPIC_API_KEY`(또는 `ANTHROPIC_AUTH_TOKEN`)가 있으면 `@anthropic-ai/sdk`, 없으면 **이 PC 에 로그인된 Claude Code CLI(구독)** 를 `claude -p --output-format json` 으로 실행(서버가 로컬 PC 에서 돌 때만 동작). 결과는 항상 Zod 로 검증.
- **밈 누끼**: `@imgly/background-removal` 로 **브라우저 안에서** 배경을 지운다(외부 서비스·키 없음). 처음 한 번 모델(~40MB)을 내려받는다. 결과 PNG 는 포스트 `assets/cutout_NN.png` 로 올라가 누끼 라이브러리가 되고, 레이어(`kind: cutout`)로 캔버스에 얹는다.
- **피드 규격**: 포스트 패널에서 4:5(기본) · 3:4(새 그리드 비율) · 1:1(재활용) · 1.91:1(링크 카드) 선택. 전환 시 텍스트·레이어 세로 좌표를 비례 이동. 승인 게이트·렌더 업로드가 규격 픽셀을 검사한다.
- **폰트**: 캔버스용 7종(Noto Sans/Serif KR, 나눔명조, 송명, 고운돋움, Black Han Sans, 개구) 전부 `next/font` self-host → 내보내기 결정적.

이미 dev 서버가 떠 있으면 `npx playwright test -c playwright.existing.config.ts` (기본 http://localhost:3000, `E2E_BASE_URL` 로 변경).

## Google Drive 연결 (M2)

1. Google Cloud 콘솔에서 서비스 계정 생성 → JSON 키 다운로드 → **Drive API 활성화**.
2. Drive 에 `/Instagram Magazine` 폴더를 만들고 서비스 계정 이메일(`xxx@yyy.iam.gserviceaccount.com`)에 **편집자**로 공유. 폴더 URL 의 ID 를 `GOOGLE_DRIVE_ROOT_FOLDER_ID` 로.
3. 하위 폴더(`inbox/<CH>`, `<CH>/{draft,approved,published}`, `_system`)는 앱이 첫 접근 시 자동 생성한다.
4. 환경변수:

```env
DRIVE_CLIENT=google
GOOGLE_SERVICE_ACCOUNT_JSON=<서비스 계정 JSON 파일을 base64 로 인코딩한 한 줄>
GOOGLE_DRIVE_ROOT_FOLDER_ID=<폴더 ID>
```

```bash
# base64 인코딩 (PowerShell)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account.json"))
# macOS/Linux
base64 -w0 service-account.json
```

## ChatGPT 예약 작업 계약 (inbox)

`inbox/<username>/` (설정 › 계정 카드의 inbox 링크) 에 다음 파일을 올린다. 파일명 접두 `YYYY-MM-DD_slug`, 이미지는 같은 접두 + `_1.png`, `_2.png` …

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

- front-matter 는 전부 선택. 누락·오류가 있으면 `needs_repair` 상태로 생성되고 에디터에서 저장하면 `draft` 로 넘어간다.
- 역할은 `cover / photo / info / quote / screenshot / closing`. 생략 시 첫 장 cover, 마지막 장 closing, 나머지 info.
- 이미지는 cover/photo/screenshot 슬라이드에 순서대로 배정된다.
- 원본은 포스트 폴더의 `_inbox_original/` 로 이동. 같은 파일(id+md5)은 다시 인제스트하지 않는다.

## Instagram 연결 (M3)

Instagram API with Instagram Login 을 사용한다 (Facebook 페이지 연결 불필요, 프로페셔널 계정 필요).

1. [Meta for Developers](https://developers.facebook.com) 에서 앱 생성 → **Instagram** 제품 추가 → "API setup with Instagram login".
2. 리디렉션 URI 에 `https://<app>.vercel.app/api/instagram/oauth/callback` 등록 (로컬은 `http://localhost:3000/...`).
3. 환경변수 `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` 설정.
4. 앱 → 설정 → 계정 · 채널 → **Instagram 계정 연결**. 장기 토큰(60일)이 `_system/accounts.json` 에 AES-256-GCM 으로 저장된다.
5. 연결된 username 이 곧 채널 키. Drive 에 `/inbox/<username>/` 과 `/<username>/{draft,approved,published}/` 가 자동 생성되고, 계정 카드에 inbox 폴더 링크가 표시된다. 매일 지침에는 그 링크만 목적지로 적으면 된다.
6. 계정 카드를 펼치면 채널 이름·색·기본 스타일팩·역할별 프리셋·캡션 템플릿·기본 해시태그·팩트체크 필수 여부를 편집할 수 있다. Mock 모드에서는 "가짜 연결" 로 같은 흐름을 시험할 수 있다.

토큰은 앱을 열 때(`/api/system/status`) 만료 7일 이내면 자동 갱신된다. 브라우저에는 `username / status / expires_at` 만 내려간다.

게시 흐름(`src/lib/publish/publish-post.ts`): `publishing` 락 → 렌더별 서명 URL(`/api/public/<token>`, 30분) → 컨테이너 생성(단일 / 캐러셀) → `FINISHED` 폴링 → `media_publish` → `published` + 폴더 `/published` 이동. 실패 시 `failed` + `last_error`, 폴더 이동 없음. **자동 게시는 없다** — 게시는 사용자의 버튼 클릭으로만 시작된다.

## 접근 제한 (로그인 없음)

```env
APP_ACCESS_KEY=<긴 랜덤 문자열>
```

설정하면 `proxy.ts` 가 모든 경로에서 `md_key` 쿠키를 검사한다. 처음 한 번 `https://<app>.vercel.app/?key=<APP_ACCESS_KEY>` 를 열면 HttpOnly 쿠키(1년)가 저장되고 이후 자유롭게 접근. 키가 없거나 틀리면 404. `/api/public/*`(서명 토큰)와 `/api/cron/*`(Bearer) 는 제외.

> Vercel Deployment Protection 은 `/api/public/*` 까지 막아 IG 가 이미지를 못 가져오므로 사용하지 않는다.

## 예약 게시 (M4, 외부 핑거)

Vercel Hobby 크론은 하루 1회 제한이라 외부 핑거를 쓴다.

1. `CRON_SECRET` 환경변수 설정.
2. [cron-job.org](https://cron-job.org) 등에서 5분 간격으로 `GET https://<app>.vercel.app/api/cron/publish`, 헤더 `Authorization: Bearer <CRON_SECRET>`.
3. 인사이트: 같은 헤더로 하루 1회(UTC 01:00 권장) `GET https://<app>.vercel.app/api/cron/insights`. 결과는 Drive `_system/insights/<account_key>.json` 에 쌓이고 홈 "성과" 탭에 표시된다. 계정은 비즈니스/크리에이터여야 하며 `instagram_business_manage_insights` 권한이 필요하다.
3. 게시 시트에서 **예약** 을 선택한 포스트(`status: scheduled`, `publish.run_at`)만 `run_at ≤ now` 일 때 실행된다. 그 외 어떤 포스트도 자동으로 게시되지 않는다.

## 스타일팩 (M5)

- 내장 4종: `life-quiet-editorial`, `mind-soft-paper`, `ai-mono-grid`, `trend-hotspot` (`src/presets/styles/*.json`).
- 설정 → 스타일팩에서 `style-pack.json` 을 임포트하면 `_system/style-packs/<id>.json` 에 저장되고 채널 기본값으로 지정할 수 있다. 채널 기본 스타일팩은 역할별 기본 프리셋과 톤(배경·글자색·오버레이·서체)을 바꾼다.
- 로컬 레퍼런스에서 스켈레톤 만들기: `npm run analyze-refs -- ./refs --id my-pack` → `my-pack.style-pack.json`.

## Vercel 배포

```bash
npm i -g vercel
vercel link
vercel env add APP_ACCESS_KEY production
vercel env add APP_ENCRYPTION_KEY production      # node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
vercel env add CRON_SECRET production
vercel env add DRIVE_CLIENT production            # google
vercel env add GOOGLE_SERVICE_ACCOUNT_JSON production
vercel env add GOOGLE_DRIVE_ROOT_FOLDER_ID production
vercel env add META_APP_ID production
vercel env add META_APP_SECRET production
vercel env add META_REDIRECT_URI production
vercel env add APP_BASE_URL production            # https://<app>.vercel.app  (서명 URL 생성에 사용)
vercel --prod
```

`APP_BASE_URL` 은 IG 에 넘기는 서명 URL 의 호스트가 되므로 실제 배포 도메인이어야 한다.

## 데이터 모델

모든 Drive JSON 은 `src/types/*.ts` 의 Zod 스키마로만 읽고 쓴다.

```text
/Instagram Magazine
  /inbox/<username>/                       ← 계정 연결 시 자동 생성
  /<username>/{draft,approved,published}/<YYYY-MM-DD_slug>/
      metadata.json        PostMetadata (status, slides[], caption, hashtags, publish{…})
      sources.json         SourcesFile (fact_check_status, items[])
      visual-brief.json    VisualBrief
      editor-state.json    EditorState (슬라이드별 image/text 좌표·톤)
      /assets/source_NN.*  /renders/slide_NN.jpg  /_inbox_original/
  /_system
      accounts.json(계정=채널, 토큰 암호화) · index.json(캐시) · ingest-log.json · /style-packs/*.json
```

상태 머신: `needs_repair → draft → approved ⇄ scheduled → publishing → published | failed → approved`. 폴더 위치와 `metadata.status` 가 어긋나면 인덱스에 `status_mismatch` 경고가 붙고 게시 화면에서 폴더 기준 / 메타 기준으로 복구한다.
