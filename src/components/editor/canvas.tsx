"use client";

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Rect, Image as KImage, Text as KText, Group, Transformer } from "react-konva";
import Konva from "konva";
import useImage from "use-image";
import { CANVAS_HEIGHT, CANVAS_WIDTH, type SlideEditorState } from "@/types";
import { konvaFontFamily } from "@/lib/render/export";

export interface CanvasProps {
  slideState: SlideEditorState;
  text: string;
  imageUrl: string | null;
  displayWidth: number;
  editable?: boolean;
  onTextChange?: (patch: Partial<SlideEditorState["text"]>) => void;
  onImageChange?: (patch: Partial<SlideEditorState["image"]>) => void;
  showSafeArea?: boolean;
}

/**
 * 1080×1350 논리 좌표 고정. 화면에는 scale 만 적용.
 * 이미지는 same-origin 프록시(/api/drive/file/…) 만 → canvas taint 없음.
 */
export const SlideCanvas = forwardRef<Konva.Stage, CanvasProps>(function SlideCanvas(
  { slideState, text, imageUrl, displayWidth, editable = false, onTextChange, onImageChange, showSafeArea = false },
  ref,
) {
  const scale = displayWidth / CANVAS_WIDTH;
  const [img] = useImage(imageUrl ?? "", "anonymous");
  const imageRef = useRef<Konva.Image>(null);
  const textRef = useRef<Konva.Text>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [selected, setSelected] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    let alive = true;
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(() => alive && setFontsReady(true));
    } else setFontsReady(true);
    return () => {
      alive = false;
    };
  }, []);

  const { image: im, text: tx } = slideState;

  // 필터 적용은 cache 필요
  useEffect(() => {
    const node = imageRef.current;
    if (!node || !img) return;
    node.cache({ pixelRatio: 1 });
    node.getLayer()?.batchDraw();
  }, [img, im.brightness, im.contrast, im.saturation, im.blur, im.zoom, im.pan.x, im.pan.y]);

  useEffect(() => {
    if (!editable) return;
    const tr = trRef.current;
    if (!tr) return;
    tr.nodes(selected && textRef.current ? [textRef.current] : []);
    tr.getLayer()?.batchDraw();
  }, [selected, editable, tx.locked]);

  const cover = useMemo(() => {
    if (!img) return null;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const s = Math.max(CANVAS_WIDTH / iw, CANVAS_HEIGHT / ih) * im.zoom;
    const w = iw * s;
    const h = ih * s;
    // pan 은 -1..1 정규화: 남는 공간 안에서 이동
    const slackX = Math.max(0, w - CANVAS_WIDTH);
    const slackY = Math.max(0, h - CANVAS_HEIGHT);
    const x = -slackX / 2 - (im.pan.x * slackX) / 2;
    const y = -slackY / 2 - (im.pan.y * slackY) / 2;
    return { x, y, w, h, slackX, slackY };
  }, [img, im.zoom, im.pan.x, im.pan.y]);

  const filters = useMemo(() => {
    const list: Konva.Filter[] = [];
    if (im.brightness !== 0) list.push(Konva.Filters.Brighten);
    if (im.contrast !== 0) list.push(Konva.Filters.Contrast);
    if (im.saturation !== 0) list.push(Konva.Filters.HSL);
    if (im.blur > 0) list.push(Konva.Filters.Blur);
    return list;
  }, [im.brightness, im.contrast, im.saturation, im.blur]);

  const gradientStops = useMemo(() => {
    const c = hexToRgb(im.gradient.color);
    const a = im.gradient.opacity;
    const rgba = (o: number) => `rgba(${c.r},${c.g},${c.b},${o})`;
    switch (im.gradient.direction) {
      case "bottom":
        return { start: { x: 0, y: CANVAS_HEIGHT * 0.35 }, end: { x: 0, y: CANVAS_HEIGHT }, stops: [0, rgba(0), 1, rgba(a)] };
      case "top":
        return { start: { x: 0, y: 0 }, end: { x: 0, y: CANVAS_HEIGHT * 0.65 }, stops: [0, rgba(a), 1, rgba(0)] };
      case "full":
        return { start: { x: 0, y: 0 }, end: { x: 0, y: CANVAS_HEIGHT }, stops: [0, rgba(a * 0.6), 0.5, rgba(a * 0.25), 1, rgba(a)] };
      default:
        return null;
    }
  }, [im.gradient.color, im.gradient.direction, im.gradient.opacity]);

  const fontFamily = fontsReady ? konvaFontFamily(tx.fontFamily) : "sans-serif";

  return (
    <Stage
      ref={ref}
      width={displayWidth}
      height={Math.round(displayWidth * (CANVAS_HEIGHT / CANVAS_WIDTH))}
      scaleX={scale}
      scaleY={scale}
      onMouseDown={(e) => {
        if (e.target === e.target.getStage() || e.target.name() === "bg" || e.target.name() === "photo") setSelected(false);
      }}
      style={{ background: im.background, cursor: editable ? "default" : undefined }}
    >
      <Layer listening={editable}>
        <Rect name="bg" x={0} y={0} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill={im.background} />
        {img && cover && (
          <Group
            clipX={0}
            clipY={0}
            clipWidth={CANVAS_WIDTH}
            clipHeight={CANVAS_HEIGHT}
          >
            <KImage
              ref={imageRef}
              name="photo"
              image={img}
              x={cover.x}
              y={cover.y}
              width={cover.w}
              height={cover.h}
              filters={filters}
              brightness={im.brightness}
              contrast={im.contrast}
              saturation={im.saturation}
              blurRadius={im.blur}
              draggable={editable && !tx.locked}
              dragBoundFunc={(pos) => {
                // 화면 좌표 → 논리 좌표로 환산 후 슬랙 범위로 클램프
                const lx = pos.x / scale;
                const ly = pos.y / scale;
                const minX = -cover.slackX;
                const minY = -cover.slackY;
                return { x: Math.min(0, Math.max(minX, lx)) * scale, y: Math.min(0, Math.max(minY, ly)) * scale };
              }}
              onDragEnd={(e) => {
                if (!onImageChange) return;
                const nx = e.target.x();
                const ny = e.target.y();
                const panX = cover.slackX ? -((nx + cover.slackX / 2) * 2) / cover.slackX : 0;
                const panY = cover.slackY ? -((ny + cover.slackY / 2) * 2) / cover.slackY : 0;
                onImageChange({ pan: { x: clamp(panX, -1, 1), y: clamp(panY, -1, 1) } });
              }}
            />
          </Group>
        )}
        {im.overlay.opacity > 0 && (
          <Rect x={0} y={0} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill={im.overlay.color} opacity={im.overlay.opacity} listening={false} />
        )}
        {gradientStops && (
          <Rect
            x={0}
            y={0}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            fillLinearGradientStartPoint={gradientStops.start}
            fillLinearGradientEndPoint={gradientStops.end}
            fillLinearGradientColorStops={gradientStops.stops}
            listening={false}
          />
        )}
        {tx.frame && (
          <Rect x={40} y={40} width={CANVAS_WIDTH - 80} height={CANVAS_HEIGHT - 80} stroke={tx.color} strokeWidth={2} opacity={0.5} listening={false} />
        )}
        {showSafeArea && (
          <Rect x={80} y={80} width={CANVAS_WIDTH - 160} height={CANVAS_HEIGHT - 160} stroke="#22d3ee" dash={[12, 12]} strokeWidth={2} listening={false} />
        )}
        <KText
          ref={textRef}
          name="headline"
          text={text}
          x={tx.x}
          y={tx.y}
          width={tx.width}
          fontSize={tx.fontSize}
          fontFamily={fontFamily}
          fontStyle={tx.weight >= 600 ? "bold" : tx.weight >= 500 ? "500" : "normal"}
          lineHeight={tx.lineHeight}
          letterSpacing={tx.letterSpacing}
          align={tx.align}
          fill={tx.color}
          wrap="word"
          draggable={editable && !tx.locked}
          onClick={() => editable && setSelected(true)}
          onTap={() => editable && setSelected(true)}
          onDragEnd={(e) => onTextChange?.({ x: Math.round(e.target.x()), y: Math.round(e.target.y()) })}
          onTransformEnd={(e) => {
            const node = e.target as Konva.Text;
            const newWidth = Math.max(120, Math.round(node.width() * node.scaleX()));
            node.scaleX(1);
            node.scaleY(1);
            onTextChange?.({ x: Math.round(node.x()), y: Math.round(node.y()), width: newWidth });
          }}
        />
        {editable && (
          <Transformer
            ref={trRef}
            rotateEnabled={false}
            enabledAnchors={["middle-left", "middle-right"]}
            boundBoxFunc={(_old, next) => (next.width < 120 * scale ? _old : next)}
            anchorSize={10}
            borderStroke="#22d3ee"
            anchorStroke="#22d3ee"
            anchorFill="#ffffff"
          />
        )}
      </Layer>
    </Stage>
  );
});

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
