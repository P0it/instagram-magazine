import { SlideLayerSchema, type SlideLayer, type ShapeKey } from "@/types";

type NewLayer = Omit<SlideLayer, "id">;
const NewLayerSchema = SlideLayerSchema.omit({ id: true });

/** 필요한 값만 주면 나머지는 스키마 기본값으로 채운 새 레이어 */
export function makeLayer(p: Partial<NewLayer> & Pick<NewLayer, "kind" | "key">): NewLayer {
  return NewLayerSchema.parse(p);
}

/** 도형 키 → 화면에 보이는 이름 */
export const SHAPE_LABEL: Record<ShapeKey, string> = { rect: "사각형", circle: "원", triangle: "삼각형", star: "별", diamond: "마름모", line: "선" };

export interface ShapeDef {
  key: ShapeKey;
  label: string;
  width: number;
  height: number;
  radius?: number;
}

/** 요소 탭의 도형 목록. 기본 크기는 1080 폭 캔버스 기준 */
export const SHAPES: ShapeDef[] = [
  { key: "rect", label: "사각형", width: 360, height: 360 },
  { key: "rect", label: "둥근 사각형", width: 420, height: 280, radius: 48 },
  { key: "circle", label: "원", width: 320, height: 320 },
  { key: "triangle", label: "삼각형", width: 340, height: 300 },
  { key: "diamond", label: "마름모", width: 320, height: 320 },
  { key: "star", label: "별", width: 320, height: 320 },
  { key: "line", label: "선", width: 520, height: 8 },
];

/** 외곽선만 있는 도형 프리셋 (프레임·강조 박스) */
export const OUTLINE_SHAPES: ShapeDef[] = [
  { key: "rect", label: "테두리 사각형", width: 520, height: 360 },
  { key: "circle", label: "테두리 원", width: 360, height: 360 },
];

/** 텍스트 스타일 프리셋 — "제목 추가" 같은 한 번에 눌러 쓰는 서식 */
export interface TextStyleDef {
  id: string;
  label: string;
  sample: string;
  patch: Partial<NewLayer>;
}

export const TEXT_STYLES: TextStyleDef[] = [
  { id: "title", label: "제목", sample: "제목을 입력하세요", patch: { text: "제목을 입력하세요", fontSize: 96, weight: 700, width: 900, fontFamily: "sans", letterSpacing: -2 } },
  { id: "subtitle", label: "부제목", sample: "부제목을 입력하세요", patch: { text: "부제목을 입력하세요", fontSize: 56, weight: 500, width: 840, fontFamily: "sans", letterSpacing: -1 } },
  { id: "body", label: "본문", sample: "본문을 입력하세요", patch: { text: "본문을 입력하세요", fontSize: 38, weight: 400, width: 800, lineHeight: 1.5, fontFamily: "sans" } },
  { id: "impact", label: "임팩트", sample: "BIG IMPACT", patch: { text: "BIG IMPACT", fontSize: 150, weight: 400, width: 940, fontFamily: "anton", lineHeight: 1.05, letterSpacing: 2 } },
  { id: "serif", label: "에디토리얼 세리프", sample: "Editorial", patch: { text: "Editorial", fontSize: 130, weight: 400, width: 940, fontFamily: "playfair-display", lineHeight: 1.1, letterSpacing: -2 } },
  { id: "handwrite", label: "손글씨", sample: "오늘의 메모", patch: { text: "오늘의 메모", fontSize: 90, weight: 400, width: 800, fontFamily: "nanum-pen", lineHeight: 1.2 } },
  { id: "round", label: "둥근 제목", sample: "귀여운 제목", patch: { text: "귀여운 제목", fontSize: 100, weight: 400, width: 880, fontFamily: "jua" } },
  { id: "caps", label: "작은 대문자 라벨", sample: "NEW MENU", patch: { text: "NEW MENU", fontSize: 40, weight: 400, width: 500, fontFamily: "bebas-neue", letterSpacing: 8 } },
];
