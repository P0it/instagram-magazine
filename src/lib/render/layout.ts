import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  SlideEditorStateSchema,
  type LayoutPreset,
  type SlideEditorState,
  type SlideImageState,
  type SlideTextState,
} from "@/types";

/** 텍스트 줄 수 추정 (개행 기준) */
export function estimateLines(text: string): number {
  return Math.max(1, text.split("\n").length);
}

/** 프리셋 → 초기 텍스트 박스 좌표. 1080×1350 논리 좌표. */
export function textGeometryFromPreset(preset: LayoutPreset, text: string): Pick<SlideTextState, "x" | "y" | "width"> {
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
      y = Math.round((CANVAS_HEIGHT - blockHeight) / 2);
      break;
    case "lower-third":
      y = Math.round(CANVAS_HEIGHT * 0.62);
      break;
    case "bottom-left":
    case "bottom-center":
    default:
      y = CANVAS_HEIGHT - margin - blockHeight - 40;
      break;
  }
  return { x, y: Math.max(margin, y), width };
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

export function textStateFromPreset(preset: LayoutPreset, text: string): SlideTextState {
  const t = preset.toneDefaults;
  const geo = textGeometryFromPreset(preset, text);
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

export function slideStateFromPreset(preset: LayoutPreset, text: string): SlideEditorState {
  return { image: imageStateFromPreset(preset), text: textStateFromPreset(preset, text) };
}

/** 프리셋 전환 시: 이미지 크롭/줌/팬은 유지, 톤·텍스트 배치는 프리셋으로 */
export function applyPresetToState(prev: SlideEditorState, preset: LayoutPreset, text: string): SlideEditorState {
  const fresh = slideStateFromPreset(preset, text);
  return {
    image: { ...fresh.image, crop: prev.image.crop, zoom: prev.image.zoom, pan: prev.image.pan },
    text: { ...fresh.text, locked: prev.text.locked },
  };
}
