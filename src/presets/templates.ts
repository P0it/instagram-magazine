import { SlideEditorStateSchema, TemplateSchema, type Template, type TemplateCategory } from "@/types";
import type { FontFamily } from "@/types";

/**
 * 내장 템플릿 — 4:5(1080×1350) 기준. 바깥 여백 90, 한 장에 포인트 색은 하나, 글자 크기 대비는 크게. 본문(headline)은 슬라이드의 글이 들어가고,
 * 아래 layers 의 문구는 자리표시자(라벨·가격·번호 등)다.
 */

type L = Record<string, unknown>;

/**
 * 텍스트 레이어. x 는 정렬 기준선(left=왼쪽 가장자리, center=중앙, right=오른쪽 가장자리), y 는 윗변.
 * 레이어 좌표는 박스 중심이라 여기서 변환한다 (높이는 줄 수 × 글자 크기 × 행간 으로 추정).
 */
function txt(text: string, x: number, top: number, width: number, fontSize: number, fontFamily: FontFamily, color: string, o: { weight?: number; align?: "left" | "center" | "right"; letterSpacing?: number; lineHeight?: number; rotation?: number } = {}): L {
  const align = o.align ?? "left";
  const lineHeight = o.lineHeight ?? 1.25;
  const cx = align === "left" ? x + width / 2 : align === "right" ? x - width / 2 : x;
  const cy = top + (text.split("\n").length * fontSize * lineHeight) / 2;
  return { kind: "text", key: "text", text, x: Math.round(cx), y: Math.round(cy), width, fontSize, fontFamily, color, weight: o.weight ?? 700, align, letterSpacing: o.letterSpacing ?? 0, lineHeight, rotation: o.rotation ?? 0 };
}

/** 도형. x,y 는 박스 중심 */
function shp(key: string, x: number, y: number, width: number, height: number, o: { fill?: string; stroke?: string; strokeWidth?: number; radius?: number; rotation?: number; opacity?: number } = {}): L {
  return { kind: "shape", key, x, y, width, height, color: o.fill ?? "transparent", stroke: o.stroke ?? null, strokeWidth: o.strokeWidth ?? 0, radius: o.radius ?? 0, rotation: o.rotation ?? 0, opacity: o.opacity ?? 1 };
}

interface Main {
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontFamily: FontFamily;
  color: string;
  weight?: number;
  align?: "left" | "center" | "right";
  letterSpacing?: number;
  lineHeight?: number;
}

interface Def {
  id: string;
  name: string;
  category: TemplateCategory;
  tags: string[];
  sample: string;
  bg: string;
  main: Main;
  layers?: L[];
  photo?: boolean;
  /** 사진 템플릿의 사진 위 어둡기 / 그라디언트 */
  overlay?: number;
  gradient?: "none" | "bottom" | "top" | "full";
}

function build(d: Def): Template {
  const design = SlideEditorStateSchema.parse({
    image: {
      background: d.bg,
      overlay: { color: "#000000", opacity: d.overlay ?? 0 },
      gradient: { direction: d.gradient ?? "none", color: "#000000", opacity: 0.6 },
    },
    text: { ...d.main, weight: d.main.weight ?? 700, align: d.main.align ?? "left", letterSpacing: d.main.letterSpacing ?? 0, lineHeight: d.main.lineHeight ?? 1.2 },
    layers: (d.layers ?? []).map((l, i) => ({ id: `l${i + 1}`, ...l })),
  });
  return TemplateSchema.parse({ id: d.id, name: d.name, category: d.category, tags: d.tags, design, sample_text: d.sample, photo: d.photo ?? false, source: "builtin" });
}

/** 모든 템플릿 공통: 위쪽 메타 줄(라벨 · 쪽수)의 y */
const META_Y = 96;

const DEFS: Def[] = [
  {
    id: "bold-paper", name: "볼드 페이퍼", category: "cover", tags: ["정보", "트렌드"], sample: "요즘 뜨는\n릴스 문법\n5가지", bg: "#F2F0EA",
    main: { x: 90, y: 400, width: 900, fontSize: 156, fontFamily: "sans", color: "#111111", weight: 900, letterSpacing: -7, lineHeight: 1.1 },
    layers: [
      shp("dot", 104, META_Y + 18, 22, 22, { fill: "#FF4B2B", radius: 11 }),
      txt("TREND NOTE", 140, META_Y, 600, 30, "space-grotesk", "#111111", { weight: 700, letterSpacing: 4 }),
      txt("01 / 07", 990, META_Y, 300, 30, "space-grotesk", "#111111", { weight: 500, align: "right", letterSpacing: 2 }),
      shp("rule", 540, 1190, 900, 2, { fill: "#111111" }),
      txt("@yourhandle", 90, 1222, 500, 32, "space-grotesk", "#111111", { weight: 500 }),
      txt("넘겨서 보기", 990, 1222, 400, 32, "sans", "#111111", { weight: 500, align: "right" }),
    ],
  },
  {
    id: "night-lime", name: "나이트 라임", category: "cover", tags: ["다크", "임팩트"], sample: "알고리즘이\n좋아하는\n첫 문장", bg: "#0C0C0C",
    main: { x: 90, y: 420, width: 900, fontSize: 156, fontFamily: "sans", color: "#D4FF3A", weight: 900, letterSpacing: -6, lineHeight: 1.1 },
    layers: [
      txt("CONTENT LAB", 90, META_Y, 600, 30, "space-grotesk", "#8C8C8C", { weight: 700, letterSpacing: 5 }),
      txt("01 / 07", 990, META_Y, 300, 30, "space-grotesk", "#8C8C8C", { weight: 500, align: "right", letterSpacing: 2 }),
      shp("pill", 215, 1236, 250, 76, { stroke: "#3A3A3A", strokeWidth: 2, radius: 38 }),
      txt("@yourhandle", 215, 1216, 250, 30, "space-grotesk", "#FFFFFF", { weight: 500, align: "center" }),
    ],
  },
  {
    id: "serif-issue", name: "에디토리얼 이슈", category: "cover", tags: ["에디토리얼", "차분"], sample: "느리게 사는\n법을 배웠다", bg: "#EDE6DA",
    main: { x: 90, y: 430, width: 900, fontSize: 118, fontFamily: "serif", color: "#2B1D14", weight: 700, letterSpacing: -4, lineHeight: 1.22 },
    layers: [
      txt("ISSUE 07", 90, META_Y, 500, 28, "space-grotesk", "#2B1D14", { weight: 700, letterSpacing: 6 }),
      txt("AUTUMN", 990, META_Y, 400, 28, "space-grotesk", "#2B1D14", { weight: 500, align: "right", letterSpacing: 6 }),
      shp("rule1", 540, 168, 900, 2, { fill: "#2B1D14" }),
      shp("rule2", 540, 1130, 900, 2, { fill: "#2B1D14" }),
      txt("에디터의 노트", 90, 1166, 600, 34, "serif", "#2B1D14", { weight: 600 }),
      txt("by @yourhandle", 990, 1170, 400, 28, "space-grotesk", "#2B1D14", { weight: 500, align: "right" }),
    ],
  },
  {
    id: "photo-bottom-left", name: "포토 바텀레프트", category: "photo", tags: ["사진", "신상"], sample: "이번 주\n가장 많이 저장된\n한 장", bg: "#2A2623", photo: true, overlay: 0.08, gradient: "bottom",
    main: { x: 90, y: 880, width: 900, fontSize: 104, fontFamily: "sans", color: "#FFFFFF", weight: 900, letterSpacing: -4, lineHeight: 1.12 },
    layers: [
      shp("tag", 190, META_Y + 18, 200, 56, { fill: "#FFFFFF", radius: 28 }),
      txt("NEW DROP", 190, META_Y + 4, 200, 26, "space-grotesk", "#111111", { weight: 700, align: "center", letterSpacing: 2 }),
      txt("01 / 07", 990, META_Y + 4, 300, 28, "space-grotesk", "#FFFFFF", { weight: 500, align: "right", letterSpacing: 2 }),
    ],
  },
  {
    id: "photo-center-bold", name: "포토 센터 볼드", category: "photo", tags: ["사진", "임팩트"], sample: "저장각\n인 장소", bg: "#2A2623", photo: true, overlay: 0.38,
    main: { x: 90, y: 520, width: 900, fontSize: 170, fontFamily: "black-han-sans", color: "#FFFFFF", weight: 400, align: "center", letterSpacing: -2, lineHeight: 1.08 },
    layers: [
      txt("SAVE FOR LATER", 540, META_Y, 800, 28, "space-grotesk", "#FFFFFF", { weight: 700, align: "center", letterSpacing: 8 }),
      txt("@yourhandle", 540, 1214, 800, 30, "space-grotesk", "#FFFFFF", { weight: 500, align: "center", letterSpacing: 2 }),
    ],
  },
  {
    id: "blue-poster", name: "블루 포스터", category: "color", tags: ["포스터", "비비드"], sample: "지금 바로\n써먹는\n글쓰기 팁", bg: "#2438FF",
    main: { x: 90, y: 380, width: 900, fontSize: 164, fontFamily: "sans", color: "#FFFFFF", weight: 900, letterSpacing: -8, lineHeight: 1.06 },
    layers: [
      txt("TIPS", 90, META_Y, 400, 30, "space-grotesk", "#FFFFFF", { weight: 700, letterSpacing: 8 }),
      txt("01 / 07", 990, META_Y, 300, 30, "space-grotesk", "#FFFFFF", { weight: 500, align: "right", letterSpacing: 2 }),
      shp("pill", 290, 1230, 400, 84, { fill: "#FFFFFF", radius: 42 }),
      txt("저장해두고 보기", 290, 1206, 400, 36, "sans", "#2438FF", { weight: 700, align: "center" }),
    ],
  },
  {
    id: "pink-sticker", name: "핑크 스티커", category: "color", tags: ["키치", "귀여움"], sample: "오늘의\n소소한\n행복", bg: "#FFD3E4",
    main: { x: 90, y: 440, width: 900, fontSize: 150, fontFamily: "jua", color: "#E5185F", weight: 400, align: "center", letterSpacing: -3, lineHeight: 1.1 },
    layers: [
      shp("sticker", 880, 230, 210, 210, { fill: "#E5185F", radius: 105, rotation: 12 }),
      txt("NEW", 880, 190, 210, 64, "anton", "#FFFFFF", { weight: 400, align: "center", letterSpacing: 3, rotation: 12 }),
      txt("@yourhandle", 540, 1214, 800, 32, "space-grotesk", "#E5185F", { weight: 700, align: "center", letterSpacing: 2 }),
    ],
  },
  {
    id: "memo-card", name: "메모장 카드", category: "quote", tags: ["메모", "감성"], sample: "하루에 한 번은\n아무것도 안 하는\n시간이 필요해", bg: "#FFFFFF",
    main: { x: 150, y: 470, width: 780, fontSize: 76, fontFamily: "sans", color: "#1A1A1A", weight: 700, letterSpacing: -2, lineHeight: 1.5 },
    layers: [
      shp("frame-t", 540, 30, 1080, 60, { fill: "#E8E4DB" }),
      shp("frame-b", 540, 1320, 1080, 60, { fill: "#E8E4DB" }),
      shp("frame-l", 30, 675, 60, 1350, { fill: "#E8E4DB" }),
      shp("frame-r", 1050, 675, 60, 1350, { fill: "#E8E4DB" }),
      shp("accent", 160, 262, 18, 18, { fill: "#FF5F57", radius: 9 }),
      shp("accent2", 196, 262, 18, 18, { fill: "#FEBC2E", radius: 9 }),
      shp("accent3", 232, 262, 18, 18, { fill: "#28C840", radius: 9 }),
      txt("메모", 920, 244, 200, 34, "sans", "#9A9A9A", { weight: 500, align: "right" }),
      shp("rule", 540, 330, 760, 2, { fill: "#EDEDED" }),
      txt("2026.10.21", 160, 1086, 400, 30, "space-grotesk", "#9A9A9A", { weight: 500 }),
    ],
  },
  {
    id: "big-quote", name: "빅 쿼트", category: "quote", tags: ["인용", "다크"], sample: "작게 시작해도\n멈추지만 않으면\n닿는다", bg: "#17171B",
    main: { x: 90, y: 560, width: 900, fontSize: 92, fontFamily: "serif", color: "#FFFFFF", weight: 700, letterSpacing: -2, lineHeight: 1.4 },
    layers: [
      txt("\u201C", 80, 180, 400, 400, "playfair-display", "#FF6B4A", { weight: 700, lineHeight: 1 }),
      shp("rule", 150, 1136, 120, 4, { fill: "#FF6B4A" }),
      txt("— 이름 · 직함", 90, 1168, 800, 32, "sans", "#A5A5AD", { weight: 500 }),
    ],
  },
  {
    id: "number-step", name: "넘버 스텝", category: "list", tags: ["리스트", "정보"], sample: "첫 3초에\n승부를 건다", bg: "#F7F7F5",
    main: { x: 90, y: 700, width: 900, fontSize: 104, fontFamily: "sans", color: "#111111", weight: 900, letterSpacing: -4, lineHeight: 1.14 },
    layers: [
      txt("01", 80, 140, 700, 400, "anton", "#E3E1DA", { weight: 400, letterSpacing: -4, lineHeight: 1 }),
      txt("STEP", 90, META_Y, 300, 30, "space-grotesk", "#111111", { weight: 700, letterSpacing: 8 }),
      shp("dot", 940, 1230, 100, 100, { fill: "#111111", radius: 50 }),
      txt("NEXT", 940, 1216, 100, 22, "space-grotesk", "#FFFFFF", { weight: 700, align: "center", letterSpacing: 1 }),
    ],
  },
  {
    id: "stat-card", name: "숫자 카드", category: "list", tags: ["데이터", "정보"], sample: "응답자 10명 중 8명이\n첫 장만 보고 넘겨요", bg: "#EFEFEA",
    main: { x: 90, y: 800, width: 900, fontSize: 62, fontFamily: "sans", color: "#111111", weight: 700, letterSpacing: -2, lineHeight: 1.35 },
    layers: [
      txt("DATA", 90, META_Y, 300, 30, "space-grotesk", "#111111", { weight: 700, letterSpacing: 8 }),
      txt("87%", 80, 220, 920, 400, "anton", "#111111", { weight: 400, letterSpacing: -6, lineHeight: 1 }),
      shp("bar", 540, 740, 900, 14, { fill: "#D8D8D0", radius: 7 }),
      shp("fill", 90 + 783 / 2, 740, 783, 14, { fill: "#FF4B2B", radius: 7 }),
      txt("출처 · 자체 설문 (2026)", 90, 1230, 700, 28, "sans", "#8A8A84", { weight: 500 }),
    ],
  },
  {
    id: "closing-save", name: "마무리 · 저장", category: "closing", tags: ["클로징", "CTA"], sample: "도움이 됐다면\n저장해두세요", bg: "#0C0C0C",
    main: { x: 90, y: 470, width: 900, fontSize: 112, fontFamily: "sans", color: "#FFFFFF", weight: 900, align: "center", letterSpacing: -5, lineHeight: 1.16 },
    layers: [
      txt("THANKS FOR READING", 540, META_Y, 800, 28, "space-grotesk", "#8C8C8C", { weight: 700, align: "center", letterSpacing: 8 }),
      shp("pill", 540, 1040, 560, 100, { fill: "#D4FF3A", radius: 50 }),
      txt("팔로우하고 다음 글 받기", 540, 1016, 560, 36, "sans", "#0C0C0C", { weight: 700, align: "center" }),
      txt("@yourhandle", 540, 1150, 560, 30, "space-grotesk", "#8C8C8C", { weight: 500, align: "center", letterSpacing: 2 }),
    ],
  },
];

export const BUILTIN_TEMPLATES: readonly Template[] = DEFS.map(build);

export function getBuiltinTemplate(id: string): Template | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === id);
}
