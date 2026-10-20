# Instagram 다크 셸 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱 톤앤매너를 Instagram 데스크톱 풍 다크 UI로 바꾸고, 상단 채널 탭 구조를 왼쪽 사이드바(레퍼런스 · 템플릿 · 콘텐츠 만들기 · 게시 큐 · 설정)로 재편한다.

**Architecture:** 이미 있는 Montage semantic 토큰의 `.dark` 블록을 Instagram 팔레트로 재매핑하고 `<html>`에 `dark`를 고정한다(컴포넌트는 토큰만 쓰므로 색 하드코딩만 걷어낸다). `(desk)` 레이아웃의 `TopBar`를 `Sidebar`로 교체하고, 레퍼런스 보드를 균일 카드 격자 + 카드 안 슬라이드 넘기기 + 상세 모달로 바꾸며, 내장 템플릿을 보는 `/templates` 화면을 추가한다.

**Tech Stack:** Next.js 16 (App Router, Turbopack), Tailwind v4 토큰, TanStack Query, Zustand, vitest, Playwright.

**Spec:** 별도 문서 없음. 승인된 목업 `docs/superpowers/mockups/2026-10-20-instagram-dark-shell.html`(브라우저로 열어 클릭해 볼 수 있음)이 시각 기준이다. 아래 Global Constraints가 대화에서 정한 결정이다.

## Global Constraints

- 이번 범위는 **톤앤매너 + 구조(내비게이션)** 뿐이다. 레퍼런스 자동 수집(예약 작업), 폰트·밈 스티커 등 에디터 기능 추가, 템플릿 "이 템플릿으로 만들기" 연결은 **하지 않는다**.
- 앱 전체 다크 고정. 라이트 모드·토글 없음. 라이트 토큰 블록(`:root`)은 지우지 않는다.
- 팔레트: 배경 `#000000`, 표면 `#121212`, 띄운 표면 `#1C1C1C`, 구분선 `#262626`, 본문 `#F5F5F5`, 보조 `#A8A8A8`, 포인트 `#0095F6`, 그라데이션 링 `linear-gradient(45deg,#feda75,#fa7e1e,#d62976,#962fbf,#4f5bd5)`.
- 사이드바 메뉴와 경로(고정): 레퍼런스 `/references` · 템플릿 `/templates` · 콘텐츠 만들기 `/home` · 게시 큐 `/queue` · 설정 `/settings`. 라이프/브랜드/마인드 구분 UI는 어디에도 남기지 않는다.
- `CLAUDE.md` 절대 규칙 유지: DB 없음, 인증 라이브러리 없음, Drive/Instagram 코드는 `server-only`, `any` 금지, 하드코딩 채널 enum 재도입 금지. 계정 목록은 `useAccountList()`, 현재 계정은 `useChannel()`(쿼리 `?ch=`).
- 계정 연동 페이지(`/settings/accounts`, OAuth 흐름)는 동작을 바꾸지 않는다. 스타일만 맞춘다.
- 캔버스(슬라이드 렌더) 색은 건드리지 않는다. 내보내기 결과가 달라지면 안 된다.
- Next.js 16 관례 유지. 코드 작성 전 `node_modules/next/dist/docs/`의 관련 가이드를 읽는다(`AGENTS.md`).

## Review Focus

- 계정이 0개일 때 사이드바와 `NoAccounts` 화면이 다크에서 깨지지 않는다(하단 계정 영역이 빈 상태 안내 + "계정 연결" 링크).
- `?ch=` 값이 연결된 계정에 없을 때 사이드바 계정 표시가 크래시하지 않고 첫 계정으로 대체된다.
- 레퍼런스 이미지가 1장이면 화살표·점·`1/n` 표시가 나오지 않는다.
- 검색창 같은 입력창에 포커스가 있을 때 ← → 키가 슬라이드를 넘기지 않는다.
- Dialog·Dropdown·Sheet·Toast(sonner) 등 포털 UI가 다크 토큰을 쓴다(흰 배경 번쩍임 없음).
- 뷰포트 폭 1024px 미만에서 사이드바가 아이콘 레일로 줄어 본문을 가리지 않는다.

---

## File Structure

- Modify `src/app/globals.css` — `.dark` 토큰 블록을 Instagram 팔레트로, `body` 배경.
- Modify `src/app/layout.tsx` — `<html className="dark …">`, `viewport.themeColor` 다크 고정, `<Toaster>` 테마 확인.
- Create `src/components/shell/nav-items.ts` — 메뉴 정의와 `activeNavKey(pathname)` (순수 함수).
- Create `src/components/shell/sidebar.tsx` — 사이드바(메뉴, 큐 배지, 동기화, 계정 전환).
- Delete `src/components/shell/top-bar.tsx` — 동기화 로직은 `sidebar.tsx`로 이동.
- Modify `src/app/(desk)/layout.tsx` — 가로 flex(사이드바 + main).
- Modify `src/mocks/seed.ts` — 라이프/트렌드 2채널 시드를 계정 1개로.
- Create `src/lib/client/slide-index.ts` — `stepSlide(index, delta, count)` (클라이언트 전용 순수 함수).
- Create `src/components/references/reference-card.tsx`; Modify `reference-board.tsx`, `reference-detail.tsx`.
- Create `src/components/templates/template-thumb.tsx` (templates-panel에서 추출), `template-gallery.tsx`, `src/app/(desk)/templates/page.tsx`.
- Modify `src/components/{home,queue,settings,editor}/**` — 라이트 전제 하드코딩 색 제거.
- Tests: `tests/unit/nav-items.test.ts`, `tests/unit/slide-index.test.ts`, `tests/e2e/shell.spec.ts`, Modify `tests/e2e/smoke.spec.ts`.

---

### Task 1: Instagram 다크 토큰 고정

**Files:**
- Modify: `src/app/globals.css` (`.dark, [data-theme="dark"]` 블록, `body` 규칙)
- Modify: `src/app/layout.tsx`
- Test: `tests/e2e/shell.spec.ts`

**Interfaces:**
- Produces: 모든 후속 Task가 쓰는 토큰 값. 매핑: `--semantic-background-normal-alternative`(body) `#000000`, `--semantic-background-normal-normal` `#121212`, `--semantic-background-elevated-normal` `#1C1C1C`, `--semantic-line-solid-neutral`·`-normal` `#262626`, `--semantic-label-normal` `#F5F5F5`, `--semantic-label-alternative` `#A8A8A8`, `--semantic-primary-normal` `#0095F6`(strong `#1877F2`).

- [ ] **Step 1: Write the failing test** — `tests/e2e/shell.spec.ts`: `/home` 로드 후 `getComputedStyle(document.body).backgroundColor === "rgb(0, 0, 0)"`, `document.documentElement.classList.contains("dark")`가 true.
- [ ] **Step 2: Run** `npm run e2e -- tests/e2e/shell.spec.ts` — Expected: FAIL (현재 라이트).
- [ ] **Step 3: Implement** — `.dark` 블록 값을 위 매핑으로 바꾸고(나머지 status/accent 토큰은 유지), `layout.tsx`의 `<html>` className에 `dark` 추가, `viewport.themeColor`를 `#000000` 단일 값으로. `--primary-foreground`는 `#ffffff` 유지.
- [ ] **Step 4: Run** 같은 명령 — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/app/globals.css src/app/layout.tsx tests/e2e/shell.spec.ts && git commit -m "feat(ui): Instagram 다크 토큰 고정"`

### Task 2: 사이드바 내비게이션

**Files:**
- Create: `src/components/shell/nav-items.ts`, `src/components/shell/sidebar.tsx`
- Delete: `src/components/shell/top-bar.tsx`
- Modify: `src/app/(desk)/layout.tsx`
- Test: `tests/unit/nav-items.test.ts`, `tests/e2e/shell.spec.ts`

**Interfaces:**
- Produces: `type NavKey = "references" | "templates" | "create" | "queue" | "settings"`; `NAV_ITEMS: readonly { key: NavKey; label: string; href: string }[]` (Global Constraints의 순서·경로·라벨); `activeNavKey(pathname: string): NavKey | null`.
- Consumes: `useSync`, `useSystemStatus`, `usePosts` (`@/lib/client/queries`), `useAccountList`, `useChannel`, `accountMeta` (`@/lib/client/channel`).

- [ ] **Step 1: Write the failing test** — `nav-items.test.ts`: `activeNavKey("/references")`·`"/references/abc"` → `"references"`; `"/templates"` → `"templates"`; `"/home"`·`"/library"`·`"/dashboard"` → `"create"`; `"/queue"` → `"queue"`; `"/settings/drive"` → `"settings"`; `"/nope"` → `null`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/nav-items.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement `nav-items.ts`** (prefix 매칭).
- [ ] **Step 4: Run** same — Expected: PASS.
- [ ] **Step 5: Implement `Sidebar`** (client component). 폭 244px, 1024px 미만은 72px 아이콘 레일(라벨 숨김). 상단 로고(그라데이션 사각 + "Magazine Desk"), 메뉴 5개(lucide 아이콘, 활성 항목 굵게), 게시 큐 항목에 대기 건수 배지(기존 TopBar의 `queued` 계산 그대로), 하단에 동기화 상태 줄과 새로고침 버튼(기존 `syncLabel`·자동 동기화 `useEffect` 그대로 이동), 맨 아래 계정 영역: 그라데이션 링 아바타 + `@handle` + 연결 상태 점, 클릭하면 `dropdown-menu`로 계정 전환(`setChannel`)과 "계정 추가" → `/settings/accounts`. `/home`·`/queue` 링크는 기존처럼 `?ch=` 유지.
- [ ] **Step 6: Wire** — `(desk)/layout.tsx`를 `flex h-dvh` 가로 레이아웃(`<Sidebar/>` + `<main>`)으로 바꾸고 `top-bar.tsx` 삭제, `grep -rn "top-bar\|TopBar" src` 가 비어야 한다.
- [ ] **Step 7: e2e** — `shell.spec.ts`에 추가: `/home`에서 `getByRole("link", { name: "레퍼런스" })`·`"템플릿"`·`"콘텐츠 만들기"`·`"게시 큐"`·`"설정"` 보임, "라이프"·"마인드" 텍스트 없음, 레퍼런스 클릭 시 URL `/references`. Run `npm run e2e -- tests/e2e/shell.spec.ts` — Expected: PASS.
- [ ] **Step 8: Commit** — `git commit -m "feat(shell): 상단 채널 탭을 사이드바로 교체"`

### Task 3: 시드를 단일 계정으로

**Files:**
- Modify: `src/mocks/seed.ts`
- Modify: `tests/e2e/smoke.spec.ts:11` (제목 정규식)

- [ ] **Step 1: Update smoke test first** — heading 기대값을 새 시드 제목으로. 새 시드 계정: key `my.account`, name `내 계정`, 기존 "라이프" 채널의 포스트·초안 4건을 이 계정으로 옮기고 "트렌드" 채널과 `SeedKey` 유니온·`channelFolders`의 두 번째 항목을 제거(`SeedKey`는 단일 리터럴로).
- [ ] **Step 2: Run** `npm run e2e -- tests/e2e/smoke.spec.ts` — Expected: FAIL (시드 미변경).
- [ ] **Step 3: Implement** the seed change. 스타일팩 JSON(`life-quiet-editorial`, `mind-soft-paper`)은 렌더 규칙이 참조하므로 **삭제하지 않는다**(비목표). 시드 계정의 `stylePack`은 기존 값 하나를 그대로 쓴다.
- [ ] **Step 4: Run** `npm test && npm run e2e -- tests/e2e/smoke.spec.ts` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "chore(mocks): 시드를 계정 1개로 단순화"`

### Task 4: 레퍼런스 보드 — 균일 격자, 카드 안 넘기기, 상세 모달

**Files:**
- Create: `src/lib/client/slide-index.ts`, `src/components/references/reference-card.tsx`
- Modify: `src/components/references/reference-board.tsx`, `reference-detail.tsx`
- Test: `tests/unit/slide-index.test.ts`, `tests/e2e/shell.spec.ts`

**Interfaces:**
- Produces: `stepSlide(index: number, delta: number, count: number): number` (0..count-1로 clamp, `count <= 1`이면 0); `ReferenceCard({ reference, onOpen }: { reference: <기존 보드가 쓰는 레퍼런스 타입>; onOpen: () => void })`.
- Consumes: 기존 레퍼런스 타입과 이미지 목록(보드/상세가 이미 쓰는 필드). 이미지가 1장뿐이면 `count = 1`.

- [ ] **Step 1: Write the failing test** — `slide-index.test.ts`: `stepSlide(0, -1, 5) === 0`, `stepSlide(4, 1, 5) === 4`, `stepSlide(1, 1, 5) === 2`, `stepSlide(0, 1, 1) === 0`, `stepSlide(0, 1, 0) === 0`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/slide-index.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement `stepSlide`**; Run — Expected: PASS.
- [ ] **Step 4: Implement `ReferenceCard`** — 4:5 비율 썸네일 영역 + 높이 40px 하단 바, 카드 호버 시 ‹ › 버튼(첫/끝 장에서 해당 방향 숨김), 우상단 `i/n`, 하단 점, 카드가 호버 상태일 때만 ← → 키 처리하되 `document.activeElement`가 input/textarea/contenteditable이면 무시. 화살표 버튼 클릭은 `onOpen`을 일으키지 않는다(`stopPropagation`). 시각은 목업의 `.ref` 규칙을 따른다.
- [ ] **Step 5: Board** — `reference-board.tsx`를 `grid-template-columns: repeat(auto-fill, minmax(210px, 1fr))` 격자로 바꾸고 `ReferenceCard` 사용. 카드 클릭 시 상세 모달 열기.
- [ ] **Step 6: Detail modal** — `reference-detail.tsx`를 중앙 모달(좌 4:5 큰 뷰어 + 우 380px 정보)로 재배치: 큰 뷰어는 `stepSlide` 재사용(← → 슬라이드, ↑ ↓ 이전/다음 레퍼런스, Esc 닫기), 기존 상세가 보여주던 정보·액션(메모, 저장, 원본 링크 등)은 모두 유지하고 위치만 옮긴다. 기능 삭제 금지.
- [ ] **Step 7: e2e** — `shell.spec.ts`: `/references`에서 모든 카드 `boundingBox().width`가 서로 같고 높이도 같음(허용오차 1px); 2장 이상 카드에서 호버 후 › 클릭 시 `1/n` → `2/n`; 카드 클릭 시 `role=dialog` 보임, Esc로 닫힘. 시드에 다장 레퍼런스가 없으면 테스트 안에서 기존 레퍼런스 추가 API(`add-reference-dialog.tsx`가 호출하는 것)로 만든다. Run `npm run e2e -- tests/e2e/shell.spec.ts` — Expected: PASS.
- [ ] **Step 8: Commit** — `git commit -m "feat(references): 균일 카드 격자, 카드 안 넘기기, 상세 모달"`

### Task 5: 템플릿 화면

**Files:**
- Create: `src/components/templates/template-thumb.tsx`, `src/components/templates/template-gallery.tsx`, `src/app/(desk)/templates/page.tsx`
- Modify: `src/components/editor/templates-panel.tsx` (썸네일 추출만)
- Test: `tests/e2e/shell.spec.ts`

**Interfaces:**
- Produces: `TemplateThumb({ tpl, canvasH, displayWidth }: { tpl: Template; canvasH: number; displayWidth: number })` — `templates-panel.tsx`의 기존 `TemplateThumb`(+`DEMO_PHOTO`)를 `displayWidth` 인자만 추가해 이동; `TemplateGallery()`.
- Consumes: `BUILTIN_TEMPLATES`, `TEMPLATE_CATEGORIES`, `TEMPLATE_CATEGORY_LABEL`, `useTemplates()`(내 템플릿).

- [ ] **Step 1: Write the failing test** — `shell.spec.ts`: `/templates`에서 heading "템플릿", 카드가 `BUILTIN_TEMPLATES` 개수(또는 최소 1개) 이상, 카테고리 칩 클릭 시 해당 카테고리 카드만 남음.
- [ ] **Step 2: Run** — Expected: FAIL (404).
- [ ] **Step 3: Extract** `TemplateThumb` into the shared file; `templates-panel.tsx`가 거기서 import(기본 `displayWidth={118}`로 동작 불변).
- [ ] **Step 4: Implement gallery** — 칩(전체 · 카테고리들 · 내가 만든 것) + `repeat(auto-fill, minmax(210px, 1fr))` 격자, 카드는 4:5 썸네일 + 이름 + `4:5 · 카테고리`. "이 템플릿으로 만들기" 버튼은 **넣지 않는다**(비목표). 페이지는 `(desk)/templates/page.tsx`에서 `Suspense` 안에 렌더(기존 `references/page.tsx` 패턴 따라).
- [ ] **Step 5: Run** `npm run e2e -- tests/e2e/shell.spec.ts && npm test` — Expected: PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(templates): 템플릿 갤러리 화면"`

### Task 6: 남은 화면 다크 정리

**Files:**
- Modify: `src/components/{home,queue,settings,publish,md,ui}/**`, `src/components/editor/**` (크롬만; 캔버스 제외), `src/components/shell/no-accounts.tsx`

- [ ] **Step 1: 찾기** — `grep -rnE "bg-white|text-black|bg-\[#|text-\[#|border-\[#|#fff\b|#ffffff" src/components | grep -v "canvas\|render"`로 하드코딩 목록을 만든다. 슬라이드 렌더·내보내기와 직접 관련된 파일(`src/components/editor/canvas*`, `src/lib/render/**`)은 제외.
- [ ] **Step 2: 교체** — 각 항목을 `bg-surface`/`bg-surface-alt`/`bg-elevated`/`text-label*`/`border-line*` 같은 기존 토큰 유틸로 바꾼다. 새 토큰 추가 금지.
- [ ] **Step 3: 홈(콘텐츠 만들기)** — `home-board.tsx` 제목 영역에서 채널 색 점+`meta.title` 헤딩은 유지하되 페이지 이름 "콘텐츠 만들기"가 사이드바 활성 항목과 일치하게 한다(헤딩 텍스트는 `smoke.spec.ts` 기대와 같이 유지).
- [ ] **Step 4: 시각 확인** — dev 서버 `http://localhost:3100`에서 `/home`, `/references`, `/templates`, `/queue`, `/settings/accounts`, `/settings/drive`, 에디터 한 건을 Playwright로 스크린샷 찍어 흰 배경 잔재·읽기 어려운 대비가 없는지 직접 본다. 대화창(Dialog), 드롭다운, 토스트도 하나씩 연다.
- [ ] **Step 5: 전체 검증** — `npm run build && npm test && npm run e2e` — Expected: 전부 PASS.
- [ ] **Step 6: Commit** — `git commit -m "style: 남은 화면 다크 토큰 정리"`

---

## Self-Review

- **Spec coverage:** 다크(T1, T6) · 인스타 톤(T1, T4) · 라이프/브랜드/마인드 UI 제거 + 메뉴 재편(T2, T3) · 레퍼런스 균일 격자·카드 안 넘기기·상세(T4) · 템플릿 탭(T5) · 계정 연동 유지(T2, Global Constraints). 목업의 "콘텐츠 만들기" 에디터 패널(글꼴·밈) 신규 기능은 비목표로 명시.
- **Placeholder scan:** T4의 레퍼런스 타입, T3의 시드 세부는 해당 파일을 읽어야 정해지는 값이라 "기존 타입/필드 그대로"로 두었다. 새로 정하는 이름·시그니처는 모두 위에 있다.
- **Type consistency:** `NavKey`/`activeNavKey`(T2), `stepSlide`(T4), `TemplateThumb` props(T5)가 정의된 곳과 쓰는 곳이 같다.
- **Proportion:** 코드 본문 없이 시그니처·테스트 기대값·값 매핑만 담았다.

## 구현자가 정한 값이 아닌, 이 계획의 판단(검토 요청)

1. 시드를 `my.account` 하나로 합침(라이프/트렌드 제거). 스타일팩 JSON(life/mind)은 렌더가 참조하므로 남김.
2. 템플릿 화면은 이번에 보기 전용(적용 버튼 없음). 에디터 서랍의 템플릿 적용은 기존 그대로.
3. 1024px 미만 사이드바는 72px 아이콘 레일.
