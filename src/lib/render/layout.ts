import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  SlideEditorStateSchema,
  type SlideLayer,
  type LayoutPreset,
  type SlideEditorState,
  type SlideImageState,
  type SlideTextState,
} from "@/types";

/** 텍스트 줄 수 추정 (개행 기준) */
export function estimateLines(text: string): number {
  return Math.max(1, text.split("\n").length);
}

/** 프리셋 → 초기 텍스트 박스 좌표. 폭 1080 고정, 높이는 포스트 규격(기본 1350). */
export function textGeometryFromPreset(preset: LayoutPreset, text: string, canvasHeight = CANVAS_HEIGHT): Pick<SlideTextState, "x" | "y" | "width"> {
  const margin = preset.safeMargin;
  const width = Math.round(CANVAS_WIDTH * preset.textWidthRatio);
  const lines = Math.min(estimateLines(text), preset.maxLines);
  const blockHeight = Math.round(lines * preset.defaultFontSize * preset.toneDefaults.lineHeight);

  const x =
    preset.align === "center"
      ? Math.round((CANVAS_WIDTH - width) / 2)
      : preset.align === "right"
        ? CANVAS_WIDTH - margin - width
        : margin;

  let y: number;
  switch (preset.textPlacement) {
    case "top-left":
    case "top-center":
      y = margin + 40;
      break;
    case "center":
      y = Math.round((canvasHeight - blockHeight) / 2);
      break;
    case "lower-third":
      y = Math.round(canvasHeight * 0.62);
      break;
    case "bottom-left":
    case "bottom-center":
    default:
      y = canvasHeight - margin - blockHeight - 40;
      break;
  }
  return { x, y: Math.max(Math.min(margin, canvasHeight * 0.1), y), width };
}

export function imageStateFromPreset(preset: LayoutPreset): SlideImageState {
  const t = preset.toneDefaults;
  return SlideEditorStateSchema.shape.image.parse({
    brightness: t.brightness,
    contrast: t.contrast,
    saturation: t.saturation,
    blur: t.blur,
    overlay: { color: "#000000", opacity: t.overlayOpacity },
    gradient: { direction: t.gradient, color: "#000000", opacity: t.gradientOpacity },
    background: t.background,
  });
}

export function textStateFromPreset(preset: LayoutPreset, text: string, canvasHeight = CANVAS_HEIGHT): SlideTextState {
  const t = preset.toneDefaults;
  const geo = textGeometryFromPreset(preset, text, canvasHeight);
  return SlideEditorStateSchema.shape.text.parse({
    ...geo,
    fontSize: preset.defaultFontSize,
    fontFamily: t.fontFamily,
    weight: t.weight,
    lineHeight: t.lineHeight,
    letterSpacing: t.letterSpacing,
    align: preset.align,
    color: t.textColor,
    locked: false,
    frame: t.frame,
  });
}

export function slideStateFromPreset(preset: LayoutPreset, text: string, canvasHeight = CANVAS_HEIGHT): SlideEditorState {
  return { image: imageStateFromPreset(preset), text: textStateFromPreset(preset, text, canvasHeight), layers: [] };
}

/**
 * 프리셋 전환 시: 이미지 크롭/줌/팬·요소 레이어는 유지, 텍스트 배치는 프리셋으로.
 * withImage=false 면 이미지 보정(톤)도 그대로 두고 레이아웃만 바꾼다.
 */
export function applyPresetToState(prev: SlideEditorState, preset: LayoutPreset, text: string, withImage = true, canvasHeight = CANVAS_HEIGHT): SlideEditorState {
  const fresh = slideStateFromPreset(preset, text, canvasHeight);
  return {
    image: withImage ? { ...fresh.image, crop: prev.image.crop, zoom: prev.image.zoom, pan: prev.image.pan } : prev.image,
    text: { ...fresh.text, locked: prev.text.locked },
    layers: prev.layers,
  };
}

/**
 * 규격 전환: 텍스트·레이어 세로 좌표를 새 높이에 비례 이동하고 캔버스 안으로 클램프.
 * 이미지 크롭/팬은 cover 로직이 새 비율에 맞춰 다시 계산하므로 손대지 않는다.
 */
export function reflowSlideForHeight(state: SlideEditorState, fromHeight: number, toHeight: number): SlideEditorState {
  const k = toHeight / fromHeight;
  const text = { ...state.text, y: Math.round(Math.min(Math.max(0, state.text.y * k), toHeight - 60)) };
  const layers: SlideLayer[] = state.layers.map((l) => ({ ...l, y: Math.round(Math.min(Math.max(0, l.y * k), toHeight)) }));
  return { ...state, text, layers };
}
