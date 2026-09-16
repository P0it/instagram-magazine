import { z } from "zod";
import { FontFamilySchema, TextAlignSchema } from "./preset";

export const CANVAS_WIDTH = 1080;
export const CANVAS_HEIGHT = 1350;

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

/**
 * 텍스트/이미지 위에 얹는 요소 레이어(스티커·아이콘). 좌표는 1080×1350 논리 px, (x,y) 는 중심.
 * 누끼(cutout) 는 배경 제거 백엔드가 없어 아직 kind 에 없다.
 */
export const SlideLayerSchema = z.object({
  id: z.string(),
  kind: z.enum(["sticker", "icon"]),
  key: z.string(),
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
  canvas: z
    .object({ width: z.literal(1080).default(1080), height: z.literal(1350).default(1350) })
    .default({ width: 1080, height: 1350 }),
  slides: z.record(z.string(), SlideEditorStateSchema).prefault({}),
  updated_at: z.string().optional(),
});
export type EditorState = z.infer<typeof EditorStateSchema>;
