import { z } from "zod";
import { FontFamilySchema, TextAlignSchema } from "./preset";

export const CANVAS_WIDTH = 1080;
/** 기본(4:5) 캔버스 높이. 포스트 규격에 따라 달라지므로 새 코드는 formatDims() 를 쓴다 */
export const CANVAS_HEIGHT = 1350;

/**
 * 피드 규격. 인스타 캐러셀은 모든 장이 같은 비율이어야 하므로 포스트 단위.
 * 폭은 항상 1080, 높이만 다르다.
 */
export const POST_FORMATS = ["4:5", "3:4", "1:1", "1.91:1"] as const;
export const PostFormatSchema = z.enum(POST_FORMATS);
export type PostFormat = z.infer<typeof PostFormatSchema>;

export interface FormatInfo {
  width: 1080;
  height: number;
  label: string;
  /** 어디에 쓰는 규격인지 한 줄 */
  hint: string;
}

export const FORMAT_INFO: Record<PostFormat, FormatInfo> = {
  "4:5": { width: 1080, height: 1350, label: "1080 × 1350", hint: "세로형 · 피드 기본. 매거진 캐러셀 표준" },
  "3:4": { width: 1080, height: 1440, label: "1080 × 1440", hint: "세로형 · 2025 새 프로필 그리드 비율. 그리드에서 안 잘림" },
  "1:1": { width: 1080, height: 1080, label: "1080 × 1080", hint: "정사각 · 옛 기본 규격. 다른 SNS 썸네일 재활용용" },
  "1.91:1": { width: 1080, height: 566, label: "1080 × 566", hint: "가로형 · 링크 카드(OG)·광고 비율. 피드 노출은 작음" },
};

export function formatDims(format: PostFormat): { width: number; height: number } {
  const f = FORMAT_INFO[format];
  return { width: f.width, height: f.height };
}

export function formatOfDims(width: number, height: number): PostFormat | null {
  return (POST_FORMATS.find((f) => FORMAT_INFO[f].width === width && FORMAT_INFO[f].height === height) ?? null);
}

export const CropSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  width: z.number().default(1),
  height: z.number().default(1),
});

export const SlideImageStateSchema = z.object({
  crop: CropSchema.default({ x: 0, y: 0, width: 1, height: 1 }),
  zoom: z.number().min(1).max(4).default(1),
  pan: z.object({ x: z.number().default(0), y: z.number().default(0) }).default({ x: 0, y: 0 }),
  brightness: z.number().min(-1).max(1).default(0),
  contrast: z.number().min(-100).max(100).default(0),
  saturation: z.number().min(-2).max(2).default(0),
  blur: z.number().min(0).max(40).default(0),
  overlay: z
    .object({
      color: z.string().default("#000000"),
      opacity: z.number().min(0).max(1).default(0.35),
    })
    .default({ color: "#000000", opacity: 0.35 }),
  gradient: z
    .object({
      direction: z.enum(["none", "bottom", "top", "full"]).default("bottom"),
      color: z.string().default("#000000"),
      opacity: z.number().min(0).max(1).default(0.6),
    })
    .default({ direction: "bottom", color: "#000000", opacity: 0.6 }),
  background: z.string().default("#0a0a0a"),
});
export type SlideImageState = z.infer<typeof SlideImageStateSchema>;

export const SlideTextStateSchema = z.object({
  x: z.number().default(80),
  y: z.number().default(880),
  width: z.number().default(920),
  fontSize: z.number().min(12).max(300).default(72),
  fontFamily: FontFamilySchema.default("sans"),
  weight: z.number().int().default(700),
  lineHeight: z.number().default(1.25),
  letterSpacing: z.number().default(-1),
  align: TextAlignSchema.default("left"),
  color: z.string().default("#ffffff"),
  locked: z.boolean().default(false),
  frame: z.boolean().default(false),
});
export type SlideTextState = z.infer<typeof SlideTextStateSchema>;

export const STICKER_KEYS = ["tape", "badge", "pill", "quote", "arrow", "highlight", "date", "frame"] as const;
export const StickerKeySchema = z.enum(STICKER_KEYS);
export type StickerKey = z.infer<typeof StickerKeySchema>;

export const ICON_KEYS = ["sparkles", "heart", "check", "clock", "bookmark", "pencil", "eye", "link", "circle-check", "info"] as const;
export const IconKeySchema = z.enum(ICON_KEYS);
export type IconKey = z.infer<typeof IconKeySchema>;

/** 누끼 PNG 는 포스트 assets 폴더에 이 접두사로 저장된다 */
export const CUTOUT_PREFIX = "cutout_";

/**
 * 텍스트/이미지 위에 얹는 요소 레이어(스티커·아이콘·누끼). 좌표는 1080×H 논리 px, (x,y) 는 중심.
 * cutout 은 브라우저에서 배경을 지운 투명 PNG(assets/cutout_NN.png) 를 가리킨다.
 */
export const SlideLayerSchema = z.object({
  id: z.string(),
  kind: z.enum(["sticker", "icon", "cutout"]),
  key: z.string(),
  /** cutout: assets 폴더 파일명 */
  asset: z.string().nullable().default(null),
  x: z.number().default(540),
  y: z.number().default(540),
  width: z.number().min(24).max(1080).default(300),
  /** 사용자가 박스를 직접 늘렸을 때만 존재. 없으면 스티커 기본 비율 */
  height: z.number().min(24).max(1350).optional(),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  flip: z.boolean().default(false),
  text: z.string().default(""),
  /** 주 색: 배지/하이라이트 배경, 아이콘 색, 그 외 스티커의 글자색 */
  color: z.string().default("#FFFFFF"),
  /** 배경/글자색 오버라이드 ("none" 은 배경 없음) */
  bg: z.string().nullable().default(null),
  ink: z.string().nullable().default(null),
  fontFamily: FontFamilySchema.default("sans"),
  hidden: z.boolean().default(false),
  locked: z.boolean().default(false),
});
export type SlideLayer = z.infer<typeof SlideLayerSchema>;

export const SlideEditorStateSchema = z.object({
  image: SlideImageStateSchema.prefault({}),
  text: SlideTextStateSchema.prefault({}),
  layers: z.array(SlideLayerSchema).default([]),
});
export type SlideEditorState = z.infer<typeof SlideEditorStateSchema>;

export const EditorStateSchema = z.object({
  schema_version: z.literal(1).default(1),
  /** 포스트 규격의 픽셀 크기. metadata.format 과 같은 값을 가리킨다 (기본 4:5) */
  canvas: z
    .object({
      width: z.literal(1080).default(1080),
      height: z
        .number()
        .int()
        .refine((h) => POST_FORMATS.some((f) => FORMAT_INFO[f].height === h), "height must match a post format")
        .default(1350),
    })
    .default({ width: 1080, height: 1350 }),
  slides: z.record(z.string(), SlideEditorStateSchema).prefault({}),
  updated_at: z.string().optional(),
});
export type EditorState = z.infer<typeof EditorStateSchema>;
