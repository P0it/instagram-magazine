import { SlideEditorStateSchema, TemplateSchema, type Template, type TemplateCategory } from "@/types";
import type { FontFamily } from "@/types";

/**
 * 내장 템플릿 — 4:5(1080×1350) 기준. 본문(headline)은 슬라이드의 글이 들어가고,
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

const DEFS: Def[] = [
  {
    id: "navy-mint-headline", name: "네이비 × 민트 헤드라인", category: "color", tags: ["강렬", "모던"], sample: "이번 주\n신메뉴 안내", bg: "#0B1F3A",
    main: { x: 90, y: 470, width: 900, fontSize: 124, fontFamily: "sans", color: "#5EEAD4", letterSpacing: -3, lineHeight: 1.15 },
    layers: [
      txt("NEW MENU", 90, 150, 600, 44, "bebas-neue", "#FFFFFF", { weight: 400, letterSpacing: 10 }),
      shp("line", 300, 214, 420, 6, { fill: "#5EEAD4" }),
      txt("@mycafe · 오늘도 맛있게", 90, 1230, 900, 34, "sans", "#FFFFFF", { weight: 400 }),
    ],
  },
  {
    id: "black-lime-impact", name: "블랙 × 라임 임팩트", category: "color", tags: ["강렬", "트렌디"], sample: "오늘만\n특별 할인", bg: "#0A0A0A",
    main: { x: 80, y: 430, width: 920, fontSize: 168, fontFamily: "black-han-sans", color: "#C6FF00", weight: 400, align: "center", lineHeight: 1.1 },
    layers: [
      shp("circle", 880, 220, 300, 300, { stroke: "#C6FF00", strokeWidth: 6 }),
      txt("SALE", 880, 172, 300, 78, "anton", "#FFFFFF", { weight: 400, align: "center", letterSpacing: 4 }),
      txt("~ 10.31 까지", 540, 1160, 800, 40, "sans", "#FFFFFF", { weight: 500, align: "center" }),
    ],
  },
  {
    id: "cream-serif-morning", name: "크림 세리프 모닝", category: "cafe", tags: ["내추럴", "에디토리얼"], sample: "Morning\nCoffee", bg: "#F5F0E1",
    main: { x: 90, y: 440, width: 900, fontSize: 168, fontFamily: "playfair-display", color: "#1F4D3A", weight: 400, letterSpacing: -4, lineHeight: 1.02 },
    layers: [
      txt("COFFEE & DESSERT", 90, 170, 800, 40, "bebas-neue", "#C46A2B", { weight: 400, letterSpacing: 9 }),
      shp("line", 540, 1130, 900, 3, { fill: "#1F4D3A" }),
      txt("매일 아침 8시 오픈", 90, 1190, 900, 38, "sans", "#1F4D3A", { weight: 500 }),
    ],
  },
  {
    id: "photo-black-label", name: "블랙 라벨 에디토리얼", category: "photo", tags: ["에디토리얼", "카페"], sample: "시그니처 라떼", bg: "#2A2623", photo: true, overlay: 0.12, gradient: "bottom",
    main: { x: 90, y: 1040, width: 900, fontSize: 92, fontFamily: "sans", color: "#FFFFFF", letterSpacing: -2, lineHeight: 1.15 },
    layers: [
      shp("rect", 290, 960, 400, 86, { fill: "#111111", radius: 4 }),
      txt("오늘의 추천", 290, 935, 400, 40, "sans", "#FFFFFF", { weight: 600, align: "center" }),
    ],
  },
  {
    id: "photo-center-serif", name: "센터 세리프 무드", category: "photo", tags: ["미니멀", "무드"], sample: "Hello\nAutumn", bg: "#2A2623", photo: true, overlay: 0.34,
    main: { x: 90, y: 540, width: 900, fontSize: 150, fontFamily: "playfair-display", color: "#FFFFFF", weight: 400, align: "center", letterSpacing: -3, lineHeight: 1.05 },
    layers: [
      shp("line", 540, 470, 120, 3, { fill: "#FFFFFF" }),
      shp("line", 540, 880, 120, 3, { fill: "#FFFFFF" }),
      txt("SEASON MENU", 540, 1140, 800, 36, "bebas-neue", "#FFFFFF", { weight: 400, align: "center", letterSpacing: 10 }),
    ],
  },
  {
    id: "photo-white-frame", name: "화이트 프레임", category: "photo", tags: ["미니멀", "갤러리"], sample: "오늘의 디저트", bg: "#2A2623", photo: true, overlay: 0.1, gradient: "bottom",
    main: { x: 120, y: 1090, width: 840, fontSize: 64, fontFamily: "nanum-myeongjo", color: "#FFFFFF", weight: 700, align: "center", lineHeight: 1.2 },
    layers: [
      shp("rect", 540, 675, 940, 1230, { stroke: "#FFFFFF", strokeWidth: 5 }),
      txt("DESSERT", 540, 110, 600, 36, "bebas-neue", "#FFFFFF", { weight: 400, align: "center", letterSpacing: 12 }),
    ],
  },
  {
    id: "menu-board", name: "메뉴판", category: "food", tags: ["메뉴", "가격"], sample: "오늘의 메뉴", bg: "#F3EBDD",
    main: { x: 90, y: 150, width: 900, fontSize: 120, fontFamily: "bebas-neue", color: "#4A2E1F", weight: 400, align: "center", letterSpacing: 6, lineHeight: 1 },
    layers: [
      shp("line", 540, 330, 900, 3, { fill: "#4A2E1F" }),
      txt("아메리카노\n카페라떼\n바닐라 라떼\n크루아상\n티라미수", 110, 400, 560, 56, "sans", "#4A2E1F", { weight: 500, lineHeight: 1.9 }),
      txt("4,500\n5,000\n5,500\n4,800\n6,500", 930, 400, 260, 56, "sans", "#B8793F", { weight: 700, align: "right", lineHeight: 1.9 }),
      shp("line", 540, 1010, 900, 3, { fill: "#4A2E1F" }),
      txt("※ 모든 메뉴 ICE · HOT 선택 가능", 540, 1080, 900, 32, "sans", "#4A2E1F", { weight: 400, align: "center" }),
    ],
  },
  {
    id: "notice-yellow", name: "공지 옐로", category: "notice", tags: ["공지", "밝음"], sample: "휴무 안내", bg: "#FFE680",
    main: { x: 90, y: 480, width: 900, fontSize: 150, fontFamily: "jua", color: "#151515", weight: 400, lineHeight: 1.1 },
    layers: [
      shp("rect", 250, 220, 330, 90, { fill: "#151515", radius: 45 }),
      txt("NOTICE", 250, 196, 330, 42, "bebas-neue", "#FFE680", { weight: 400, align: "center", letterSpacing: 8 }),
      txt("10월 31일(금)은\n내부 정비로 쉬어요.\n불편을 드려 죄송합니다.", 90, 830, 900, 48, "sans", "#151515", { weight: 500, lineHeight: 1.55 }),
      shp("circle", 880, 1130, 280, 280, { fill: "#FF5A36" }),
      txt("꼭\n확인!", 880, 1053, 280, 70, "jua", "#FFFFFF", { weight: 400, align: "center", lineHeight: 1.1, rotation: -8 }),
    ],
  },
  {
    id: "event-pink", name: "이벤트 핑크", category: "notice", tags: ["이벤트", "키치"], sample: "EVENT\n오픈 기념", bg: "#FF3D9A",
    main: { x: 80, y: 440, width: 920, fontSize: 156, fontFamily: "black-han-sans", color: "#111111", weight: 400, align: "center", lineHeight: 1.08 },
    layers: [
      shp("star", 880, 250, 320, 320, { fill: "#FFFFFF", rotation: 12 }),
      txt("50%", 880, 196, 320, 86, "anton", "#FF3D9A", { weight: 400, align: "center", rotation: 12 }),
      txt("선착순 100명에게 드려요", 540, 1110, 900, 44, "sans", "#111111", { weight: 700, align: "center" }),
    ],
  },
  {
    id: "quote-offwhite", name: "에디토리얼 인용", category: "quote", tags: ["인용", "미니멀"], sample: "느리게 마시는 커피가\n하루를 바꿔요", bg: "#F5F5F2",
    main: { x: 110, y: 520, width: 860, fontSize: 78, fontFamily: "nanum-myeongjo", color: "#111111", weight: 700, lineHeight: 1.5 },
    layers: [
      txt("“", 100, 140, 300, 360, "playfair-display", "#FF4D2E", { weight: 400 }),
      shp("line", 200, 1010, 180, 4, { fill: "#111111" }),
      txt("오늘의 한 줄", 110, 1060, 500, 36, "sans", "#111111", { weight: 500 }),
    ],
  },
  {
    id: "cobalt-pink-bold", name: "코발트 × 핑크", category: "color", tags: ["키치", "트렌디"], sample: "오늘의\n신상 디저트", bg: "#1E3AFF",
    main: { x: 80, y: 470, width: 920, fontSize: 150, fontFamily: "do-hyeon", color: "#FFB3E6", weight: 400, align: "center", lineHeight: 1.1 },
    layers: [
      shp("circle", 180, 230, 220, 220, { stroke: "#FFB3E6", strokeWidth: 6 }),
      shp("circle", 920, 1150, 300, 300, { stroke: "#FFB3E6", strokeWidth: 6 }),
      txt("SWEET", 540, 1110, 700, 60, "bebas-neue", "#FFFFFF", { weight: 400, align: "center", letterSpacing: 14 }),
    ],
  },
  {
    id: "burgundy-cream", name: "버건디 클래식", category: "color", tags: ["클래식", "무드"], sample: "Wine &\nCheese Night", bg: "#5A1A25",
    main: { x: 80, y: 500, width: 920, fontSize: 132, fontFamily: "dm-serif-display", color: "#F6E7D4", weight: 400, align: "center", lineHeight: 1.1 },
    layers: [
      shp("line", 540, 340, 700, 3, { fill: "#E8A87C" }),
      shp("line", 540, 380, 700, 3, { fill: "#E8A87C" }),
      shp("line", 540, 1000, 700, 3, { fill: "#E8A87C" }),
      txt("FRIDAY · 7PM", 540, 1040, 800, 40, "bebas-neue", "#E8A87C", { weight: 400, align: "center", letterSpacing: 12 }),
    ],
  },
  {
    id: "forest-lime-list", name: "포레스트 리스트", category: "info", tags: ["정보", "리스트"], sample: "오늘의 포인트", bg: "#12372A",
    main: { x: 90, y: 160, width: 900, fontSize: 96, fontFamily: "sans", color: "#E4F27A", letterSpacing: -2, lineHeight: 1.15 },
    layers: [
      txt("01", 90, 560, 160, 90, "anton", "#E4F27A", { weight: 400 }),
      txt("첫 번째 포인트를 적어요", 270, 580, 720, 48, "sans", "#FFFFFF", { weight: 500 }),
      txt("02", 90, 780, 160, 90, "anton", "#E4F27A", { weight: 400 }),
      txt("두 번째 포인트를 적어요", 270, 800, 720, 48, "sans", "#FFFFFF", { weight: 500 }),
      txt("03", 90, 1000, 160, 90, "anton", "#E4F27A", { weight: 400 }),
      txt("세 번째 포인트를 적어요", 270, 1020, 720, 48, "sans", "#FFFFFF", { weight: 500 }),
    ],
  },
  {
    id: "photo-top-label", name: "상단 라벨 + 사진", category: "photo", tags: ["신상", "라벨"], sample: "가을 한정\n밤 라떼", bg: "#2A2623", photo: true, overlay: 0.1, gradient: "top",
    main: { x: 90, y: 230, width: 900, fontSize: 104, fontFamily: "sans", color: "#FFFFFF", letterSpacing: -3, lineHeight: 1.12 },
    layers: [
      shp("rect", 190, 130, 200, 64, { fill: "#FFFFFF", radius: 32 }),
      txt("NEW", 190, 109, 200, 34, "bebas-neue", "#111111", { weight: 400, align: "center", letterSpacing: 6 }),
    ],
  },
  {
    id: "sage-circle", name: "세이지 서클", category: "cafe", tags: ["내추럴", "차분"], sample: "오늘도\n수고했어요", bg: "#A8B5A0",
    main: { x: 160, y: 560, width: 760, fontSize: 92, fontFamily: "nanum-myeongjo", color: "#1B2A1E", weight: 700, align: "center", lineHeight: 1.35 },
    layers: [
      shp("circle", 540, 675, 800, 800, { fill: "#F5F0E1" }),
      txt("slow café", 540, 1160, 800, 40, "playfair-display", "#1B2A1E", { weight: 400, align: "center", letterSpacing: 2 }),
    ],
  },
  {
    id: "terracotta-sticker", name: "테라코타 스티커", category: "food", tags: ["웜", "프로모션"], sample: "오늘의\n브런치", bg: "#C65D3B",
    main: { x: 90, y: 430, width: 900, fontSize: 150, fontFamily: "gowun-batang", color: "#FFF1E0", weight: 700, lineHeight: 1.12 },
    layers: [
      shp("rect", 330, 1000, 520, 120, { fill: "#FFF1E0", radius: 60, rotation: -4 }),
      txt("오늘만 10% 할인", 330, 971, 520, 46, "jua", "#C65D3B", { weight: 400, align: "center", rotation: -4 }),
      shp("circle", 900, 230, 200, 200, { stroke: "#FFF1E0", strokeWidth: 5 }),
    ],
  },
  {
    id: "purple-lime-bold", name: "퍼플 × 라임", category: "color", tags: ["강렬", "트렌디"], sample: "THIS\nWEEKEND", bg: "#5B2BFF",
    main: { x: 80, y: 360, width: 920, fontSize: 250, fontFamily: "anton", color: "#D7FF3A", weight: 400, lineHeight: 0.95, letterSpacing: 2 },
    layers: [
      shp("line", 540, 1000, 900, 8, { fill: "#D7FF3A" }),
      txt("놓치지 마세요!", 120, 1060, 700, 90, "nanum-pen", "#FFFFFF", { weight: 400, rotation: -5 }),
    ],
  },
  {
    id: "closing-follow", name: "마무리 · 팔로우", category: "info", tags: ["클로징", "CTA"], sample: "저장하고\n나중에 보기", bg: "#0A0A0A",
    main: { x: 80, y: 470, width: 920, fontSize: 124, fontFamily: "sans", color: "#FFFFFF", letterSpacing: -3, align: "center", lineHeight: 1.18 },
    layers: [
      shp("rect", 540, 1010, 560, 110, { stroke: "#C6FF00", strokeWidth: 5, radius: 55 }),
      txt("FOLLOW  @mycafe", 540, 985, 560, 40, "bebas-neue", "#C6FF00", { weight: 400, align: "center", letterSpacing: 6 }),
    ],
  },
];

export const BUILTIN_TEMPLATES: readonly Template[] = DEFS.map(build);

export function getBuiltinTemplate(id: string): Template | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === id);
}
