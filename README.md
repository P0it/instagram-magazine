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

Mock 모드는 인메모리 Drive 에 채널별 샘플 포스트(draft/approved/published/failed/scheduled/needs_repair)와 inbox 샘플(.md + .png)이 시드된다. 상단 바의 **Drive 새로고침**을 누르면 inbox 샘플이 "초안" 카드로 나타난다. 서버 재시작 시 초기화.

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
| `/editor/[postId]` | 빌더. 좌: 프리셋 / 요소(스티커·아이콘 레이어) / 레이어, 중앙: Konva 1080×1350 캔버스 + 선택 툴바 + 안전 영역 + 줌, 우: 선택에 따른 텍스트·이미지·요소·포스트 패널, 하단 슬라이드 스트립. **자동 저장**(1.5s) + 유휴 렌더(12s), undo/redo, 미리보기(피드·프로필 그리드·다크), **게시 바텀시트**(저장→렌더→승인→게시, 지금/나중에) |
| `/publish/[postId]` | 게시 기록 · 승인 체크리스트(서버 강제) · 상태 전이 · status_mismatch 복구 · 재게시 · 그리드 미리보기 |
| `/queue` | publishing / scheduled / failed / approved 목록, 재시도, 예약 취소 (상단 바 아이콘) |
| `/settings/*` | Instagram 계정(OAuth·해제), 채널(channels.json), 스타일팩(임포트·채널 기본값), Drive·시스템 |

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

`inbox/<CHANNEL>/` 에 다음 파일을 올린다. 파일명 접두 `YYYY-MM-DD_slug`, 이미지는 같은 접두 + `_1.png`, `_2.png` …

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

- front-matter 는 전부 선택. 누락·오류가 있으면 `needs_repair` 상태로 생성되고 에디터에서 저장하면 `draft` 로 넘어간다.
- 역할은 `cover / photo / info / quote / screenshot / closing`. 생략 시 첫 장 cover, 마지막 장 closing, 나머지 info.
- 이미지는 cover/photo/screenshot 슬라이드에 순서대로 배정된다.
- 원본은 포스트 폴더의 `_inbox_original/` 로 이동. 같은 파일(id+md5)은 다시 인제스트하지 않는다.

## Instagram 연결 (M3)

Instagram API with Instagram Login 을 사용한다 (Facebook 페이지 연결 불필요, 프로페셔널 계정 필요).

1. [Meta for Developers](https://developers.facebook.com) 에서 앱 생성 → **Instagram** 제품 추가 → "API setup with Instagram login".
2. 리디렉션 URI 에 `https://<app>.vercel.app/api/instagram/oauth/callback` 등록 (로컬은 `http://localhost:3000/...`).
3. 환경변수 `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` 설정.
4. 앱 → 설정 → Instagram 계정 → 계정 키(예: `life`) 선택 → **Instagram 으로 연결**. 장기 토큰(60일)이 `_system/accounts.json` 에 AES-256-GCM 으로 저장된다.
5. 채널 설정의 `instagram_account_key` 가 이 키와 일치해야 게시 시트에서 기본 선택된다.

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
  /inbox/{LIFE,MIND,AI,TREND}/
  /<CH>/{draft,approved,published}/<YYYY-MM-DD_slug>/
      metadata.json        PostMetadata (status, slides[], caption, hashtags, publish{…})
      sources.json         SourcesFile (fact_check_status, items[])
      visual-brief.json    VisualBrief
      editor-state.json    EditorState (슬라이드별 image/text 좌표·톤)
      /assets/source_NN.*  /renders/slide_NN.jpg  /_inbox_original/
  /_system
      channels.json · accounts.json(토큰 암호화) · index.json(캐시) · ingest-log.json · /style-packs/*.json
```

상태 머신: `needs_repair → draft → approved ⇄ scheduled → publishing → published | failed → approved`. 폴더 위치와 `metadata.status` 가 어긋나면 인덱스에 `status_mismatch` 경고가 붙고 게시 화면에서 폴더 기준 / 메타 기준으로 복구한다.
