import { describe, expect, it } from "vitest";
import { detectDraftFormat, parseDraft } from "@/lib/ingest/parse-draft";

const LOOSE = `schema_version: 1.0
id: 2026-09-17-trend-gochujang-butter
channel: TREND
status: draft
topic: McDonald’s Korea 기획 고추장 버터
editorial_angle: K-푸드가 아시아 공통 캠페인으로 수출되는 신호.
headline: 오늘부터 ‘고추장 버터’가 아시아 메뉴가 된다

caption:
9월 17일 한국에서 먼저 시작하는 캠페인의 재미있는 포인트는 G-Dragon만이 아니다.
한국식 맛 조합을 글로벌 브랜드의 새 문법으로 만드는 쪽일지도 모른다.

hashtags: #트렌드 #고추장버터 #맥도날드 #K푸드
source_urls:
- https://www.koreatimes.co.kr/business/companies/20260909/g-dragon
fact_check_notes:
- 한국 캠페인은 2026-09-17 시작.
verified_at: 2026-09-17 KST

tone_layer: {intensity: 1, expressions: []}
trend_metadata:
category: food / brand culture
price_range: official Korea channel re-check required

slides:
1) role: discovery_hook
headline: 오늘부터 ‘고추장 버터’가 아시아 메뉴가 된다
body: 맥도날드 한국에서 시작해 13개 아시아 시장으로 가는 캠페인.
asset_mode: HUMAN_ASSET_REQUIRED
visual_prompt: McDonald’s Korea official campaign visual
layout_preset: full_bleed_product_cover

2) role: why_now
headline: 포인트는 지드래곤만이 아니다
body: 캠페인의 공통 맛은 ‘고추장 버터’.
asset_mode: text_only

3) role: practical_details
headline: 한국에서는 이렇게 시작한다
body:
- 시작: 2026년 9월 17일
- 메뉴: 맥크리스피 고추장 버터
asset_mode: text_only

4) role: closing
headline: 저장해두고 매장에서 확인
body: 판매 조건은 공식 채널에서 재확인.
`;

const JSON_DRAFT = `{
  "schema_version": 1,
  "id": "2026-09-13-life-001",
  "channel": "LIFE",
  "status": "draft",
  "content_type": "carousel",
  "topic": "청년미래적금 2차 가입 준비",
  "headline": "12월 2차 모집 전에\\n이건 미리 확인",
  "slides": [
    { "slide_id": "slide_01", "role": "cover", "text": "청년미래적금\\n12월 2차 모집 전에", "asset_mode": "generated" },
    { "slide_id": "slide_02", "role": "info", "text": "누가 대상?\\n만 19~34세 청년", "asset_mode": "text_only" },
    { "slide_id": "slide_03", "role": "context", "text": "첫 모집은 끝났지만", "asset_mode": "generated" },
    { "slide_id": "slide_04", "role": "closing", "text": "지금 할 일", "asset_mode": "text_only" }
  ],
  "caption": "첫 모집을 놓쳤다면 12월 2차 가입 기회를 체크해둘 만합니다.",
  "hashtags": ["#청년정책", "#청년미래적금"],
  "source_urls": ["https://www.fsc.go.kr/po010104/87196"]
}`;

const MD = `---
channel: life.magazine
headline: "월세 내고 있다면"
hashtags: [청년정책]
---
## slide 1 (cover)
월세 내고 있다면
## caption
캡션
`;

describe("parseDraft", () => {
  it("detects the three formats", () => {
    expect(detectDraftFormat(LOOSE)).toBe("loose");
    expect(detectDraftFormat(JSON_DRAFT)).toBe("json");
    expect(detectDraftFormat(MD)).toBe("markdown");
  });

  it("parses the loose Google-Docs style draft", () => {
    const d = parseDraft(LOOSE);
    expect(d.format).toBe("loose");
    expect(d.frontMatter.channel).toBe("trend");
    expect(d.frontMatter.headline).toBe("오늘부터 ‘고추장 버터’가 아시아 메뉴가 된다");
    expect(d.frontMatter.topic).toContain("고추장 버터");
    expect(d.frontMatter.hashtags).toEqual(["트렌드", "고추장버터", "맥도날드", "K푸드"]);
    expect(d.frontMatter.sources?.[0]?.url).toContain("koreatimes.co.kr");
    expect(d.caption).toContain("G-Dragon만이 아니다");
    expect(d.caption).toContain("새 문법으로");
    expect(d.slides.map((s) => s.role)).toEqual(["cover", "info", "info", "closing"]);
    expect(d.slides[0].text).toBe("오늘부터 ‘고추장 버터’가 아시아 메뉴가 된다\n맥도날드 한국에서 시작해 13개 아시아 시장으로 가는 캠페인.");
    expect(d.slides[2].text).toContain("- 시작: 2026년 9월 17일");
    expect(d.slides[2].text).toContain("- 메뉴: 맥크리스피 고추장 버터");
    expect(d.problems).toEqual([]);
  });

  it("parses the JSON draft", () => {
    const d = parseDraft(JSON_DRAFT);
    expect(d.format).toBe("json");
    expect(d.frontMatter.channel).toBe("life");
    expect(d.frontMatter.headline).toBe("12월 2차 모집 전에\n이건 미리 확인");
    expect(d.frontMatter.content_type).toBe("carousel");
    expect(d.frontMatter.hashtags).toEqual(["청년정책", "청년미래적금"]);
    expect(d.slides).toHaveLength(4);
    expect(d.slides.map((s) => s.role)).toEqual(["cover", "info", "info", "closing"]);
    expect(d.slides[0].text).toBe("청년미래적금\n12월 2차 모집 전에");
    expect(d.caption).toContain("2차 가입 기회");
    expect(d.problems).toEqual([]);
  });

  it("still handles the .md format", () => {
    const d = parseDraft(MD);
    expect(d.format).toBe("markdown");
    expect(d.frontMatter.channel).toBe("life.magazine");
    expect(d.slides[0].role).toBe("cover");
    expect(d.caption).toBe("캡션");
  });

  it("reports problems instead of throwing on junk", () => {
    const d = parseDraft("그냥 메모");
    expect(d.slides).toHaveLength(0);
    expect(d.problems.length).toBeGreaterThan(0);
    const broken = parseDraft("{ not json");
    expect(broken.format).toBe("loose");
  });
});

describe("parseDraftName / groupInboxFiles with Google Docs", () => {
  it("extracts date and slug from Google Docs titles", async () => {
    const { parseDraftName, groupInboxFiles } = await import("@/lib/ingest/group");
    expect(parseDraftName("2026-09-17 TREND — 고추장 버터가 아시아 메뉴가 된 날")).toEqual({ date: "2026-09-17", slug: "고추장-버터가-아시아-메뉴가-된-날" });
    expect(parseDraftName("2026-09-15_AI_이미지 생성보다 편집이 더 중요해졌다")).toEqual({ date: "2026-09-15", slug: "이미지-생성보다-편집이-더-중요해졌다" });
    expect(parseDraftName("2026-09-14 LIFE Sample Draft — 디지털헤리티지 큐레이터 4기")).toEqual({ date: "2026-09-14", slug: "디지털헤리티지-큐레이터-4기" });
    expect(parseDraftName("metadata.json — LIFE — 청년미래적금")).toEqual({ date: null, slug: "metadatajson-life-청년미래적금" });
    const groups = groupInboxFiles([
      { id: "d1", name: "2026-09-17 TREND — 고추장 버터", mimeType: "application/vnd.google-apps.document" },
      { id: "i1", name: "2026-09-17_고추장-버터_1.png", mimeType: "image/png" },
    ]);
    // 문서 제목에서 뽑은 접두(2026-09-17_고추장-버터)와 이미지 접두가 같으면 한 그룹으로 묶인다
    expect(groups).toHaveLength(1);
    expect(groups[0].markdownFileId).toBe("d1");
    expect(groups[0].date).toBe("2026-09-17");
    expect(groups[0].imageFileIds.map((i) => i.fileId)).toEqual(["i1"]);
  });
});

const SECTIONS = `STATUS: draft
CHANNEL: LIFE
DATE: 2026-09-14


TOPIC
고용노동부 청년일경험 — 디지털헤리티지 큐레이터 4기


EDITORIAL ANGLE
실무형 일경험으로 정리.


HEADLINE
AI로 콘텐츠 포트폴리오 만들고 싶다면
10월 5일 전에 이건 확인


SLIDE 1 — COVER
role: cover
headline: AI로 콘텐츠 포트폴리오 만들고 싶다면
body: 10월 5일까지 모집 중인 청년 일경험 프로그램이 있습니다.
asset_mode: licensed_stock
layout_preset: editorial-left


SLIDE 2 — WHAT YOU GET
role: benefit_summary
headline: 그냥 강의가 아니라
직접 만들어보는 프로젝트
body:
• 생성형 AI를 활용한 콘텐츠 제작
• 실무 포트폴리오 완성
asset_mode: text_only
evidence_url: https://yw.work24.go.kr/d/a/x.do


SLIDE 3 — ACTION
role: evidence
headline: 지원 전 이 3개는 다시 확인
body:
1. 참여 자격
2. 중복참여 조건


CAPTION
AI를 써본 적은 있지만 결과물이 부족했다면 볼 만한 청년 일경험입니다.


서울 45명을 모집하고 있고, 모집 마감은 10월 5일입니다.


FACT CHECK NOTES
- 공식 포털에서 확인.


SOURCE URLS
1. https://yw.work24.go.kr/d/a/selectItrnPrjtEsgPrgmDtal.do
2. https://yw.work24.go.kr/search?query=x


TONE LAYER
base: contemporary Korean editorial
`;

describe("parseDraft — uppercase section format", () => {
  it("maps section headers to keys and SLIDE N blocks to slides", () => {
    const d = parseDraft(SECTIONS);
    expect(d.format).toBe("loose");
    expect(d.frontMatter.channel).toBe("life");
    expect(d.frontMatter.headline).toBe("AI로 콘텐츠 포트폴리오 만들고 싶다면\n10월 5일 전에 이건 확인");
    expect(d.frontMatter.topic).toContain("디지털헤리티지");
    expect(d.slides.map((s) => s.role)).toEqual(["cover", "info", "closing"]); // 마지막 슬라이드의 모르는 role 은 closing 으로
    expect(d.slides[1].text).toBe("그냥 강의가 아니라\n직접 만들어보는 프로젝트\n- 생성형 AI를 활용한 콘텐츠 제작\n- 실무 포트폴리오 완성");
    expect(d.slides[2].text).toContain("- 참여 자격");
    expect(d.caption).toContain("청년 일경험입니다.");
    expect(d.caption).toContain("모집 마감은 10월 5일입니다.");
    expect(d.frontMatter.sources?.map((s) => s.url)).toEqual(["https://yw.work24.go.kr/d/a/selectItrnPrjtEsgPrgmDtal.do", "https://yw.work24.go.kr/search?query=x"]);
    expect(d.problems).toEqual([]);
  });
});
