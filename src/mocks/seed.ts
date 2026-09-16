import { MockDriveClient, type MockTree } from "./drive/MockDriveClient";
import { makeGradientPng, type Rgb } from "./png";
import {
  CHANNEL_KEYS,
  ChannelsFileSchema,
  EditorStateSchema,
  InsightsFileSchema,
  PostMetadataSchema,
  SourcesFileSchema,
  VisualBriefSchema,
  type ChannelKey,
  type EditorState,
  type PostMetadata,
  type PostStatus,
  type SlideDef,
  type SlideRole,
} from "@/types";
import { CHANNEL_DEFAULT_STYLE_PACK, ROLE_DEFAULT_PRESET, getPreset, getStylePack, resolvePreset } from "@/presets";
import { slideStateFromPreset } from "@/lib/render/layout";
import { folderForStatus } from "@/lib/metadata/transitions";

interface SeedPost {
  channel: ChannelKey;
  date: string;
  slug: string;
  status: PostStatus;
  topic: string;
  headline: string;
  slides: { role: SlideRole; text: string; withImage?: boolean }[];
  caption: string;
  hashtags: string[];
  factCheck?: "pending" | "approved";
  withRenders?: boolean;
  publishedAt?: string;
  failedError?: string;
  scheduledAt?: string;
}

const PALETTES: Record<ChannelKey, [Rgb, Rgb]> = {
  LIFE: [{ r: 40, g: 44, b: 52 }, { r: 12, g: 12, b: 14 }],
  MIND: [{ r: 214, g: 200, b: 170 }, { r: 120, g: 105, b: 80 }],
  AI: [{ r: 20, g: 40, b: 70 }, { r: 5, g: 5, b: 8 }],
  TREND: [{ r: 80, g: 20, b: 70 }, { r: 12, g: 8, b: 14 }],
};

const SEED_POSTS: SeedPost[] = [
  {
    channel: "LIFE", date: "2026-09-11", slug: "youth-housing-support", status: "draft",
    topic: "청년 월세 지원", headline: "월세 내고 있다면\n이번 주 이건 확인",
    slides: [
      { role: "cover", text: "월세 내고 있다면\n이번 주 이건 확인", withImage: true },
      { role: "info", text: "청년월세 특별지원\n월 최대 20만 원, 12개월\n\n만 19~34세 · 무주택 · 독립거주\n보증금 5천만 원 이하 · 월세 70만 원 이하" },
      { role: "info", text: "신청은 복지로 또는 주민센터\n\n필요 서류\n· 임대차계약서\n· 월세 이체 내역 3개월\n· 가족관계증명서" },
      { role: "closing", text: "저장해두고\n신청 마감 전에 확인하세요" },
    ],
    caption: "월세 부담이 크다면 청년월세 특별지원을 확인해보세요. 소득·자산 기준을 충족하면 월 최대 20만 원을 12개월 동안 지원받을 수 있습니다.\n\n자세한 조건은 복지로에서 확인하세요.",
    hashtags: ["청년정책", "월세지원", "청년월세", "복지로"],
    factCheck: "pending",
  },
  {
    channel: "LIFE", date: "2026-09-10", slug: "transit-pass-changes", status: "approved",
    topic: "교통비 환급 카드", headline: "교통비 20% 돌려받는\n카드, 아직 안 만들었다면",
    slides: [
      { role: "cover", text: "교통비 20% 돌려받는\n카드, 아직 안 만들었다면", withImage: true },
      { role: "info", text: "K-패스\n월 15회 이상 이용 시\n일반 20% · 청년 30% · 저소득 53% 환급" },
      { role: "closing", text: "이번 달부터 시작하면\n다음 달에 바로 환급" },
    ],
    caption: "대중교통을 자주 탄다면 K-패스를 만들어두세요. 월 15회 이상 이용하면 지출액의 일부가 다음 달에 환급됩니다.",
    hashtags: ["K패스", "교통비", "청년혜택"],
    factCheck: "approved", withRenders: true,
  },
  {
    channel: "LIFE", date: "2026-09-08", slug: "energy-voucher", status: "published",
    topic: "에너지 바우처", headline: "여름 전기요금,\n바우처로 줄이는 법",
    slides: [
      { role: "cover", text: "여름 전기요금,\n바우처로 줄이는 법", withImage: true },
      { role: "info", text: "에너지바우처\n생계·의료·주거·교육급여 수급 가구 대상\n하절기 잔액은 동절기로 이월" },
      { role: "closing", text: "신청은 읍면동 주민센터" },
    ],
    caption: "에너지바우처 하절기 사용 기간을 확인하세요.",
    hashtags: ["에너지바우처", "전기요금"],
    factCheck: "approved", withRenders: true, publishedAt: "2026-09-08T09:12:00.000Z",
  },
  {
    channel: "LIFE", date: "2026-09-09", slug: "tax-refund-failed", status: "failed",
    topic: "연말정산 미리보기", headline: "10월에 열리는\n연말정산 미리보기",
    slides: [
      { role: "cover", text: "10월에 열리는\n연말정산 미리보기", withImage: true },
      { role: "info", text: "홈택스 → 연말정산 미리보기\n올해 예상 세액을 미리 계산" },
      { role: "closing", text: "남은 3개월 소비 계획에 활용" },
    ],
    caption: "연말정산 미리보기 서비스로 예상 환급액을 확인하세요.",
    hashtags: ["연말정산", "홈택스"],
    factCheck: "approved", withRenders: true,
    failedError: "IG API error (code 9004): Media download failed. Image URL unreachable.",
  },
  {
    channel: "MIND", date: "2026-09-11", slug: "morning-pages", status: "draft",
    topic: "모닝 페이지", headline: "아침 10분,\n생각을 종이에 내려놓기",
    slides: [
      { role: "cover", text: "아침 10분,\n생각을 종이에 내려놓기", withImage: true },
      { role: "quote", text: "\"쓰기 전까지는\n내가 무슨 생각을 하는지 모른다.\"" },
      { role: "info", text: "규칙은 하나\n멈추지 않고 세 페이지\n\n잘 쓰려 하지 않기\n다시 읽지 않기" },
      { role: "closing", text: "내일 아침에 한 번" },
    ],
    caption: "모닝 페이지는 평가 없이 쓰는 연습입니다.",
    hashtags: ["모닝페이지", "글쓰기", "마음챙김"],
  },
  {
    channel: "MIND", date: "2026-09-07", slug: "rest-is-not-reward", status: "scheduled",
    topic: "휴식", headline: "휴식은 보상이 아니라\n조건이다",
    slides: [
      { role: "cover", text: "휴식은 보상이 아니라\n조건이다", withImage: true },
      { role: "quote", text: "\"쉬는 것을 미룰수록\n쉬는 법을 잊는다.\"" },
      { role: "closing", text: "오늘 15분은 비워두기" },
    ],
    caption: "휴식을 성과의 보상으로 두지 마세요.",
    hashtags: ["휴식", "번아웃"],
    withRenders: true, scheduledAt: "2026-09-12T09:00:00.000Z",
  },
  {
    channel: "AI", date: "2026-09-11", slug: "prompt-caching-basics", status: "draft",
    topic: "프롬프트 캐싱", headline: "같은 프롬프트를\n매번 다시 내지 마세요",
    slides: [
      { role: "cover", text: "같은 프롬프트를\n매번 다시 내지 마세요", withImage: true },
      { role: "info", text: "프롬프트 캐싱\n\n1. 긴 시스템 프롬프트는 앞에\n2. 변하는 부분은 뒤에\n3. 캐시 히트율을 로그로 확인" },
      { role: "screenshot", text: "캐시 히트 시 입력 비용이 크게 줄어듭니다", withImage: true },
      { role: "closing", text: "다음 편: 배치 API" },
    ],
    caption: "프롬프트 캐싱 기본 정리.",
    hashtags: ["AI", "프롬프트", "LLM"],
  },
  {
    channel: "AI", date: "2026-09-05", slug: "broken-inbox-import", status: "needs_repair",
    topic: "", headline: "",
    slides: [{ role: "cover", text: "(헤드라인 없음 — inbox 파일에 front-matter 누락)" }],
    caption: "", hashtags: [],
  },
  {
    channel: "MIND", date: "2026-09-02", slug: "small-wins", status: "published",
    topic: "작은 성취", headline: "오늘 한 일 세 가지를\n적어두는 이유",
    slides: [
      { role: "cover", text: "오늘 한 일 세 가지를\n적어두는 이유", withImage: true },
      { role: "quote", text: "\"큰 목표는 작은 완료의\n합으로만 도착한다.\"" },
      { role: "closing", text: "자기 전 3줄" },
    ],
    caption: "작은 완료를 기록하면 다음 날의 시작이 가벼워집니다.",
    hashtags: ["작은성취", "루틴"],
    withRenders: true, publishedAt: "2026-09-02T09:00:00.000Z",
  },
  {
    channel: "AI", date: "2026-09-04", slug: "batch-api-costs", status: "published",
    topic: "배치 API", headline: "급하지 않은 작업은\n배치로 반값에",
    slides: [
      { role: "cover", text: "급하지 않은 작업은\n배치로 반값에", withImage: true },
      { role: "info", text: "배치 API\n24시간 내 처리 · 입력/출력 50% 할인\n\n대량 분류 · 요약 · 임베딩에 적합" },
      { role: "closing", text: "다음 편: 프롬프트 캐싱" },
    ],
    caption: "배치 API로 대량 작업 비용을 절반으로.",
    hashtags: ["AI", "배치API"],
    withRenders: true, publishedAt: "2026-09-04T09:00:00.000Z",
  },
  {
    channel: "TREND", date: "2026-09-06", slug: "hannam-popup-week", status: "published",
    topic: "한남 팝업", headline: "이번 주 한남동\n팝업 4곳 정리",
    slides: [
      { role: "cover", text: "이번 주 한남동\n팝업 4곳 정리", withImage: true },
      { role: "photo", text: "1. 향수 브랜드 팝업 — 시향 예약제", withImage: true },
      { role: "info", text: "2. 러닝화 런칭\n3. 도자기 편집숍\n4. 빈티지 마켓 (주말만)" },
      { role: "closing", text: "저장하고 주말에 확인" },
    ],
    caption: "이번 주 한남동 팝업 4곳. 저장해두세요.",
    hashtags: ["한남팝업", "핫플", "주말"],
    withRenders: true, publishedAt: "2026-09-06T09:00:00.000Z",
  },
  {
    channel: "TREND", date: "2026-09-11", slug: "seongsu-weekend-spots", status: "draft",
    topic: "성수 핫플", headline: "이번 주말 성수\n줄 서는 곳 3",
    slides: [
      { role: "cover", text: "이번 주말 성수\n줄 서는 곳 3", withImage: true },
      { role: "photo", text: "1. 팝업 카페 — 오픈런 필수", withImage: true },
      { role: "photo", text: "2. 빈티지 편집숍 — 주말 한정", withImage: true },
      { role: "info", text: "3. 루프탑 바\n선셋 타임 예약 오픈" },
      { role: "closing", text: "다음 주 핫플은 저장하고 확인" },
    ],
    caption: "이번 주말 성수에서 줄 서는 곳 3곳. 저장해두고 가세요.",
    hashtags: ["성수핫플", "주말나들이", "팝업"],
  },
];

const INBOX_SAMPLES: { channel: ChannelKey; prefix: string; md: string; images: number }[] = [
  {
    channel: "LIFE",
    prefix: "2026-09-12_free-health-checkup",
    images: 2,
    md: `---
channel: LIFE
content_type: carousel
topic: 국가건강검진
headline: "올해 건강검진\\n아직이라면 12월 전에"
hashtags: [건강검진, 국가건강검진, 건강보험]
sources:
  - {title: "국가건강검진 안내", url: "https://www.nhis.or.kr", publisher: "국민건강보험공단", source_type: official}
visual_direction: "quiet editorial, dark photo, white sans-serif"
---
## slide 1 (cover)
올해 건강검진
아직이라면 12월 전에
## slide 2 (info)
출생연도 짝수/홀수에 따라
2년마다 한 번
## slide 3 (info)
검진기관은 건강보험공단 홈페이지에서 검색
예약 후 방문
## slide 4 (closing)
연말엔 예약이 몰립니다
## caption
국가건강검진은 2년에 한 번, 대상 연도에 받을 수 있습니다. 12월에는 예약이 어려우니 미리 확인하세요.
`,
  },
  {
    channel: "MIND",
    prefix: "2026-09-12_saying-no",
    images: 1,
    md: `---
channel: MIND
topic: 거절
headline: "거절은 관계를 끊는 게 아니라\\n경계를 그리는 일"
hashtags: 거절, 경계, 마음
---
## slide 1 (cover)
거절은 관계를 끊는 게 아니라
경계를 그리는 일
## slide 2 (quote)
"아니요"라고 말한 뒤
설명을 덧붙이지 않아도 된다
## slide 3 (closing)
오늘 하나만 거절해보기
## caption
거절에 이유를 붙일 필요는 없습니다.
`,
  },
  {
    channel: "AI",
    prefix: "no-frontmatter-note",
    images: 0,
    md: `이 파일은 front-matter 가 없습니다.
인제스트 시 needs_repair 로 들어가야 합니다.
`,
  },
];

function isoAt(date: string, hour: number): string {
  return `${date}T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

function buildMetadata(p: SeedPost, slides: SlideDef[]): PostMetadata {
  const created = isoAt(p.date, 6);
  // 손대지 않은 초안은 updated_at === created_at (홈 3단계에서 "초안" 으로 분류)
  const untouched = (p.status === "draft" || p.status === "needs_repair") && !p.withRenders;
  const updated = untouched ? created : isoAt(p.date, 8);
  const base = PostMetadataSchema.parse({
    post_id: `${p.date}_${p.slug}`,
    channel: p.channel,
    status: p.status,
    content_type: slides.length > 1 ? "carousel" : "single",
    topic: p.topic,
    headline: p.headline,
    slides,
    caption: p.caption,
    hashtags: p.hashtags,
    asset_mode: slides.some((s) => s.asset) ? "generated" : "text_only",
    fact_check_required: p.channel === "LIFE",
    scheduled_at: p.scheduledAt ?? null,
    created_at: created,
    updated_at: updated,
  });
  if (p.status === "published") {
    base.publish = {
      account_key: p.channel.toLowerCase(), mode: "immediate", attempt: 1, max_attempts: 3,
      ig_creation_id: "1789" + p.slug.length, ig_media_id: "1802" + p.date.replace(/-/g, ""), published_at: p.publishedAt,
    };
  } else if (p.status === "failed") {
    base.publish = {
      account_key: p.channel.toLowerCase(), mode: "immediate", attempt: 1, max_attempts: 3,
      last_error: p.failedError,
    };
  } else if (p.status === "scheduled") {
    base.publish = {
      account_key: p.channel.toLowerCase(), mode: "scheduled", run_at: p.scheduledAt, attempt: 0, max_attempts: 3,
    };
  }
  return base;
}

export function buildMockTree(): MockTree {
  const tree = MockDriveClient.createEmpty();
  const drive = new MockDriveClient(tree);
  // ensureFolder 등은 async 이지만 Mock 은 동기적으로 완료되므로 Promise 를 즉시 소비해도 안전.
  // 그래도 정확성을 위해 동기 헬퍼로 직접 구성한다.
  void drive;
  return tree;
}

/** 시드 트리를 채운다 (async). getDrive() 가 최초 1회 호출. */
export async function seedMockTree(tree: MockTree): Promise<void> {
  const drive = new MockDriveClient(tree);
  const root = drive.rootFolderId();
  const now = new Date().toISOString();

  const system = await drive.ensureFolder(root, ["_system"]);
  await drive.ensureFolder(system.id, ["style-packs"]);

  const channelFolders: Record<ChannelKey, string> = { LIFE: "", MIND: "", AI: "", TREND: "" };
  for (const ch of CHANNEL_KEYS) {
    const f = await drive.ensureFolder(root, [ch]);
    channelFolders[ch] = f.id;
    for (const sub of ["draft", "approved", "published"]) await drive.ensureFolder(f.id, [sub]);
    await drive.ensureFolder(root, ["inbox", ch]);
  }

  const channelsFile = ChannelsFileSchema.parse({
    channels: CHANNEL_KEYS.map((key) => ({
      key,
      name: { LIFE: "라이프 · 생활정보", MIND: "마인드 · 마음", AI: "AI · 도구", TREND: "트렌드 · 핫플" }[key],
      color: { LIFE: "#2563eb", MIND: "#b45309", AI: "#0891b2", TREND: "#F553DA" }[key],
      drive_folder_id: channelFolders[key],
      default_style_pack: CHANNEL_DEFAULT_STYLE_PACK[key],
      default_presets_by_role: {},
      instagram_account_key: key.toLowerCase(),
      caption_template: "{{caption}}\n\n{{hashtags}}",
      default_hashtags: { LIFE: ["생활정보", "청년"], MIND: ["마음챙김"], AI: ["AI"], TREND: ["핫플", "트렌드"] }[key],
      editorial_rules: { fact_check_required: key === "LIFE" },
    })),
  });
  await drive.writeText(system.id, "channels.json", JSON.stringify(channelsFile, null, 2));
  await drive.writeText(system.id, "accounts.json", JSON.stringify({ accounts: [] }, null, 2));
  await drive.writeText(system.id, "ingest-log.json", JSON.stringify({ last_sync_at: null, entries: [] }, null, 2));

  for (const p of SEED_POSTS) {
    const stylePack = getStylePack(CHANNEL_DEFAULT_STYLE_PACK[p.channel]);
    const [top, bottom] = PALETTES[p.channel];
    const folderName = `${p.date}_${p.slug}`;
    const statusFolder = folderForStatus(p.status);
    const parent = await drive.ensureFolder(channelFolders[p.channel], [statusFolder]);
    const postFolder = await drive.createFolder(parent.id, folderName);
    const assets = await drive.createFolder(postFolder.id, "assets");
    const renders = await drive.createFolder(postFolder.id, "renders");

    const slides: SlideDef[] = [];
    const editorSlides: EditorState["slides"] = {};
    let assetIdx = 0;
    for (let i = 0; i < p.slides.length; i++) {
      const s = p.slides[i];
      const presetId = stylePack?.presets_by_role[s.role] ?? ROLE_DEFAULT_PRESET[s.role];
      let asset: string | null = null;
      if (s.withImage) {
        assetIdx++;
        const name = `source_${String(assetIdx).padStart(2, "0")}.png`;
        const png = makeGradientPng(540, 675, top, bottom);
        await drive.uploadBytes(assets.id, name, png, "image/png");
        asset = name;
      }
      const id = `s${i + 1}`;
      slides.push({ id, role: s.role, text: s.text, asset, style_preset: presetId });
      editorSlides[id] = slideStateFromPreset(resolvePreset(presetId, undefined, stylePack), s.text);
    }

    if (p.withRenders) {
      for (let i = 0; i < slides.length; i++) {
        const png = makeGradientPng(1080, 1350, bottom, top);
        await drive.uploadBytes(renders.id, `slide_${String(i + 1).padStart(2, "0")}.png`, png, "image/png");
      }
    }

    const metadata = buildMetadata(p, slides);
    await drive.writeText(postFolder.id, "metadata.json", JSON.stringify(metadata, null, 2));
    await drive.writeText(
      postFolder.id,
      "sources.json",
      JSON.stringify(
        SourcesFileSchema.parse({
          fact_check_status: p.factCheck ?? "pending",
          fact_checked_at: p.factCheck === "approved" ? isoAt(p.date, 7) : null,
          items:
            p.channel === "LIFE"
              ? [{ title: `${p.topic} 안내`, url: "https://www.gov.kr", publisher: "정부24", source_type: "official" }]
              : [],
        }),
        null,
        2,
      ),
    );
    await drive.writeText(
      postFolder.id,
      "visual-brief.json",
      JSON.stringify(
        VisualBriefSchema.parse({
          direction: stylePack?.description ?? "",
          mood: ["quiet", "editorial"],
          palette: stylePack ? Object.values(stylePack.palette) : [],
          typography: stylePack?.typography.fontFamily ?? "sans",
          from_channel_default: true,
        }),
        null,
        2,
      ),
    );
    await drive.writeText(
      postFolder.id,
      "editor-state.json",
      JSON.stringify(EditorStateSchema.parse({ slides: editorSlides, updated_at: metadata.updated_at }), null, 2),
    );
    void getPreset;
  }

  for (const s of INBOX_SAMPLES) {
    const inbox = await drive.ensureFolder(root, ["inbox", s.channel]);
    await drive.writeText(inbox.id, `${s.prefix}.md`, s.md, "text/markdown");
    const [top, bottom] = PALETTES[s.channel];
    for (let i = 1; i <= s.images; i++) {
      await drive.uploadBytes(inbox.id, `${s.prefix}_${i}.png`, makeGradientPng(540, 675, bottom, top), "image/png");
    }
  }
  await seedInsights(drive, system.id, now);
}

/** 결정적 의사난수 (시드별 재현) */
function prng(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    return x / 0xffffffff;
  };
}

const INSIGHT_BASE: Record<ChannelKey, { followers: number; reach: number; growth: number }> = {
  LIFE: { followers: 4200, reach: 1800, growth: 6 },
  MIND: { followers: 9800, reach: 3200, growth: 11 },
  AI: { followers: 2600, reach: 1400, growth: 4 },
  TREND: { followers: 1500, reach: 2600, growth: 14 },
};

/** Mock 전용: 4계정 × 120일 스냅샷 + published 포스트의 게시물 지표 */
async function seedInsights(drive: MockDriveClient, systemId: string, nowIso: string): Promise<void> {
  const folder = await drive.ensureFolder(systemId, ["insights"]);
  const nowMs = Date.parse(nowIso);
  const todayStart = Math.floor(nowMs / 86_400_000) * 86_400_000;
  for (const ch of CHANNEL_KEYS) {
    const key = ch.toLowerCase();
    const base = INSIGHT_BASE[ch];
    const rand = prng(ch.length * 7919 + base.followers);
    const days = [];
    let followers = base.followers - base.growth * 120;
    for (let i = 119; i >= 0; i--) {
      const t = todayStart - i * 86_400_000;
      const weekend = [0, 6].includes(new Date(t).getUTCDay()) ? 1.25 : 1;
      followers += Math.round(base.growth * (0.4 + rand() * 1.2));
      const reach = Math.round(base.reach * weekend * (0.6 + rand() * 0.9));
      days.push({
        date: new Date(t).toISOString().slice(0, 10),
        followers,
        reach,
        views: Math.round(reach * (1.6 + rand() * 0.8)),
        profile_views: Math.round(reach * (0.04 + rand() * 0.05)),
      });
    }
    const media = SEED_POSTS.filter((p) => p.channel === ch && p.status === "published").map((p) => {
      const reach = Math.round(base.reach * (2 + rand() * 3));
      const saves = Math.round(reach * (ch === "TREND" ? 0.09 : 0.035) * (0.7 + rand() * 0.6));
      const likes = Math.round(reach * 0.06 * (0.7 + rand() * 0.6));
      const comments = Math.round(likes * 0.08 * rand());
      const shares = Math.round(saves * 0.4 * rand());
      return {
        ig_media_id: "1802" + p.date.replace(/-/g, ""),
        post_id: `${p.date}_${p.slug}`,
        views: Math.round(reach * 1.9),
        reach, likes, comments, saves, shares,
        total_interactions: likes + comments + saves + shares,
        collected_at: nowIso,
      };
    });
    const file = InsightsFileSchema.parse({ account_key: key, ig_user_id: `1784${ch.length}`, last_collected_at: nowIso, days, media });
    await drive.writeText(folder.id, `${key}.json`, JSON.stringify(file, null, 2), "application/json");
  }
}
