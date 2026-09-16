"use client";

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Rect, Image as KImage, Text as KText, Group, Transformer, Line } from "react-konva";
import Konva from "konva";
import useImage from "use-image";
import { CANVAS_HEIGHT, CANVAS_WIDTH, type SlideEditorState, type SlideLayer } from "@/types";
import { konvaFontFamily } from "@/lib/render/export";
import { stickerColors, stickerDef, stickerHeight } from "@/lib/render/stickers";
import { iconSvgDataUrl } from "@/lib/render/icon-svg";
import type { Selection } from "@/stores/editor-store";

export interface CanvasProps {
  slideState: SlideEditorState;
  text: string;
  imageUrl: string | null;
  displayWidth: number;
  editable?: boolean;
  selection?: Selection;
  onSelect?: (sel: Selection) => void;
  onTextChange?: (patch: Partial<SlideEditorState["text"]>) => void;
  onImageChange?: (patch: Partial<SlideEditorState["image"]>) => void;
  onLayerChange?: (id: string, patch: Partial<SlideLayer>) => void;
  onGuides?: (g: { v: boolean; h: boolean }) => void;
  showSafeArea?: boolean;
  /** 포스트 규격 높이 (폭은 1080 고정). 기본 4:5 */
  canvasHeight?: number;
  /** 누끼 레이어의 assets 파일명 → same-origin URL */
  resolveAsset?: (name: string | null | undefined) => string | null;
}

const SNAP = 14;

/**
 * 1080×1350 논리 좌표 고정. 화면에는 scale 만 적용.
 * 이미지는 same-origin 프록시(/api/drive/file/…) 와 data: URL 만 → canvas taint 없음.
 */
export const SlideCanvas = forwardRef<Konva.Stage, CanvasProps>(function SlideCanvas(
  { slideState, text, imageUrl, displayWidth, editable = false, selection = null, onSelect, onTextChange, onImageChange, onLayerChange, onGuides, showSafeArea = false, canvasHeight = CANVAS_HEIGHT, resolveAsset },
  ref,
) {
  const scale = displayWidth / CANVAS_WIDTH;
  const H = canvasHeight;
  const [img] = useImage(imageUrl ?? "", "anonymous");
  const imageRef = useRef<Konva.Image>(null);
  const textRef = useRef<Konva.Text>(null);
  const layerRefs = useRef<Map<string, Konva.Group>>(new Map());
  const trRef = useRef<Konva.Transformer>(null);
  const [fontsReady, setFontsReady] = useState(() => typeof document === "undefined" || !("fonts" in document));

  useEffect(() => {
    if (fontsReady) return;
    let alive = true;
    document.fonts.ready.then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, [fontsReady]);

  const { image: im, text: tx, layers } = slideState;

  // 필터 적용은 cache 필요
  useEffect(() => {
    const node = imageRef.current;
    if (!node || !img) return;
    node.cache({ pixelRatio: 1 });
    node.getLayer()?.batchDraw();
  }, [img, im.brightness, im.contrast, im.saturation, im.blur, im.zoom, im.pan.x, im.pan.y]);

  const selectedLayer = selection?.kind === "layer" ? layers.find((l) => l.id === selection.id) : undefined;

  // Transformer 를 현재 선택 노드에 붙인다
  useEffect(() => {
    if (!editable) return;
    const tr = trRef.current;
    if (!tr) return;
    let node: Konva.Node | null = null;
    if (selection?.kind === "text" && !tx.locked) node = textRef.current;
    else if (selection?.kind === "layer" && selectedLayer && !selectedLayer.locked && !selectedLayer.hidden) node = layerRefs.current.get(selection.id) ?? null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selection, editable, tx.locked, selectedLayer, layers.length]);

  const cover = useMemo(() => {
    if (!img) return null;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const s = Math.max(CANVAS_WIDTH / iw, H / ih) * im.zoom;
    const w = iw * s;
    const h = ih * s;
    // pan 은 -1..1 정규화: 남는 공간 안에서 이동
    const slackX = Math.max(0, w - CANVAS_WIDTH);
    const slackY = Math.max(0, h - H);
    const x = -slackX / 2 - (im.pan.x * slackX) / 2;
    const y = -slackY / 2 - (im.pan.y * slackY) / 2;
    return { x, y, w, h, slackX, slackY };
  }, [img, im.zoom, im.pan.x, im.pan.y, H]);

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
        return { start: { x: 0, y: H * 0.35 }, end: { x: 0, y: H }, stops: [0, rgba(0), 1, rgba(a)] };
      case "top":
        return { start: { x: 0, y: 0 }, end: { x: 0, y: H * 0.65 }, stops: [0, rgba(a), 1, rgba(0)] };
      case "full":
        return { start: { x: 0, y: 0 }, end: { x: 0, y: H }, stops: [0, rgba(a * 0.6), 0.5, rgba(a * 0.25), 1, rgba(a)] };
      default:
        return null;
    }
  }, [im.gradient.color, im.gradient.direction, im.gradient.opacity, H]);

  const fontFamily = fontsReady ? konvaFontFamily(tx.fontFamily) : "sans-serif";
  const isTextSel = selection?.kind === "text";
  const trIsText = isTextSel;
  const keepRatio = selectedLayer ? selectedLayer.kind === "cutout" || ((selectedLayer.kind === "icon" || stickerDef(selectedLayer.key).aspect !== null) && selectedLayer.height === undefined) : false;

  /** 드래그 중 중앙선 스냅 (레이어 중심 기준) */
  const snapCenter = (pos: { x: number; y: number }) => {
    const lx = pos.x / scale;
    const ly = pos.y / scale;
    const snapV = Math.abs(lx - CANVAS_WIDTH / 2) < SNAP;
    const snapH = Math.abs(ly - H / 2) < SNAP;
    onGuides?.({ v: snapV, h: snapH });
    return { x: (snapV ? CANVAS_WIDTH / 2 : lx) * scale, y: (snapH ? H / 2 : ly) * scale };
  };

  return (
    <Stage
      ref={ref}
      width={displayWidth}
      height={Math.round(displayWidth * (H / CANVAS_WIDTH))}
      scaleX={scale}
      scaleY={scale}
      onMouseDown={(e) => {
        if (!editable) return;
        if (e.target === e.target.getStage() || e.target.name() === "bg" || e.target.name() === "photo") onSelect?.({ kind: "image" });
      }}
      style={{ background: im.background, cursor: editable ? "default" : undefined }}
    >
      <Layer listening={editable}>
        <Rect name="bg" x={0} y={0} width={CANVAS_WIDTH} height={H} fill={im.background} />
        {img && cover && (
          <Group clipX={0} clipY={0} clipWidth={CANVAS_WIDTH} clipHeight={H}>
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
              draggable={editable && selection?.kind === "image"}
              dragBoundFunc={(pos) => {
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
          <Rect name="bg" x={0} y={0} width={CANVAS_WIDTH} height={H} fill={im.overlay.color} opacity={im.overlay.opacity} />
        )}
        {gradientStops && (
          <Rect
            name="bg"
            x={0}
            y={0}
            width={CANVAS_WIDTH}
            height={H}
            fillLinearGradientStartPoint={gradientStops.start}
            fillLinearGradientEndPoint={gradientStops.end}
            fillLinearGradientColorStops={gradientStops.stops}
          />
        )}
        {tx.frame && (
          <Rect x={40} y={40} width={CANVAS_WIDTH - 80} height={H - 80} stroke={tx.color} strokeWidth={2} opacity={0.5} listening={false} />
        )}
        {showSafeArea && (
          <Rect x={65} y={Math.round(H * 0.06)} width={CANVAS_WIDTH - 130} height={H - Math.round(H * 0.12)} stroke="rgba(255,255,255,0.45)" dash={[14, 12]} strokeWidth={2} listening={false} />
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
          shadowColor="rgba(0,0,0,0.28)"
          shadowBlur={18}
          shadowOffsetY={1}
          draggable={editable && !tx.locked}
          onMouseDown={(e) => {
            if (!editable) return;
            e.cancelBubble = true;
            onSelect?.({ kind: "text" });
          }}
          onTap={() => editable && onSelect?.({ kind: "text" })}
          onDragEnd={(e) => onTextChange?.({ x: Math.round(e.target.x()), y: Math.round(e.target.y()) })}
          onTransformEnd={(e) => {
            const node = e.target as Konva.Text;
            const newWidth = Math.max(120, Math.round(node.width() * node.scaleX()));
            const sy = node.scaleY();
            node.scaleX(1);
            node.scaleY(1);
            const patch: Partial<SlideEditorState["text"]> = { x: Math.round(node.x()), y: Math.round(node.y()), width: newWidth };
            if (Math.abs(sy - 1) > 0.01) patch.fontSize = clamp(Math.round(tx.fontSize * sy), 12, 300);
            onTextChange?.(patch);
          }}
        />

        {layers.map((l) =>
          l.hidden ? null : (
            <LayerNode
              key={l.id}
              layer={l}
              editable={editable}
              fontsReady={fontsReady}
              register={(n) => {
                if (n) layerRefs.current.set(l.id, n);
                else layerRefs.current.delete(l.id);
              }}
              onSelect={() => onSelect?.({ kind: "layer", id: l.id })}
              onChange={(patch) => onLayerChange?.(l.id, patch)}
              dragBound={snapCenter}
              onDragEnd={() => onGuides?.({ v: false, h: false })}
              src={l.kind === "cutout" ? (resolveAsset?.(l.asset) ?? null) : null}
            />
          ),
        )}

        {editable && (
          <Transformer
            ref={trRef}
            rotateEnabled={!trIsText}
            keepRatio={keepRatio}
            enabledAnchors={trIsText ? ["middle-left", "middle-right", "top-left", "top-right", "bottom-left", "bottom-right"] : ["top-left", "top-right", "bottom-left", "bottom-right"]}
            boundBoxFunc={(_old, next) => (next.width < 40 * scale || next.height < 16 * scale ? _old : next)}
            anchorSize={9}
            anchorCornerRadius={3}
            borderStroke="#0066FF"
            anchorStroke="#0066FF"
            anchorFill="#ffffff"
            rotateAnchorOffset={26}
          />
        )}
      </Layer>
    </Stage>
  );
});

/** 요소 레이어 하나 — Group(중심 기준) 안에 스티커/아이콘 */
function LayerNode({
  layer: l,
  editable,
  fontsReady,
  register,
  onSelect,
  onChange,
  dragBound,
  onDragEnd,
  src,
}: {
  layer: SlideLayer;
  editable: boolean;
  fontsReady: boolean;
  register: (n: Konva.Group | null) => void;
  onSelect: () => void;
  onChange: (patch: Partial<SlideLayer>) => void;
  dragBound: (pos: { x: number; y: number }) => { x: number; y: number };
  onDragEnd: () => void;
  src: string | null;
}) {
  const def = l.kind === "sticker" ? stickerDef(l.key) : null;
  const w = l.width;
  const h = l.height ?? (def ? stickerHeight(def, w) : w);
  const colors = def ? stickerColors(def, l) : { bg: null, ink: l.color };

  return (
    <Group
      ref={register}
      name={`layer-${l.id}`}
      x={l.x}
      y={l.y}
      offsetX={w / 2}
      offsetY={h / 2}
      width={w}
      height={h}
      rotation={l.rotation}
      opacity={l.opacity}
      scaleX={l.flip ? -1 : 1}
      draggable={editable && !l.locked}
      dragBoundFunc={dragBound}
      onMouseDown={(e) => {
        if (!editable) return;
        e.cancelBubble = true;
        onSelect();
      }}
      onTap={() => editable && onSelect()}
      onDragEnd={(e) => {
        onDragEnd();
        onChange({ x: Math.round(e.target.x()), y: Math.round(e.target.y()) });
      }}
      onTransformEnd={(e) => {
        const node = e.target as Konva.Group;
        const nw = Math.max(24, Math.round(w * node.scaleX() * (l.flip ? -1 : 1)));
        const nh = Math.max(24, Math.round(h * node.scaleY()));
        node.scaleX(l.flip ? -1 : 1);
        node.scaleY(1);
        const patch: Partial<SlideLayer> = { width: nw, rotation: Math.round(node.rotation()) };
        // 고정 비율(아이콘·정사각 스티커)이 아니면 사용자가 정한 높이를 기억한다
        const fixed = l.kind === "icon" || l.kind === "cutout" || (def?.aspect !== null && l.height === undefined);
        if (!fixed || Math.abs(nh / nw - h / w) > 0.02) patch.height = nh;
        // 중심 좌표는 offset 으로 유지되므로 그대로 저장
        patch.x = Math.round(node.x());
        patch.y = Math.round(node.y());
        onChange(patch);
      }}
    >
      {l.kind === "cutout" ? (
        <CutoutImage src={src} width={w} height={h} />
      ) : l.kind === "icon" ? (
        <IconImage iconKey={l.key} color={l.color} width={w} height={h} />
      ) : def ? (
        <>
          {colors.bg && !def.dashed && (
            <Rect
              width={w}
              height={h}
              fill={colors.bg}
              cornerRadius={def.radius}
              shadowColor="rgba(0,0,0,0.2)"
              shadowBlur={def.shadow ? 24 : 0}
              shadowOffsetY={def.shadow ? 8 : 0}
              shadowEnabled={def.shadow}
            />
          )}
          {def.dashed && <Rect width={w} height={h} stroke={colors.ink} strokeWidth={4} dash={[18, 12]} cornerRadius={def.radius} />}
          {def.rules && (
            <>
              <Line points={[0, 0, w, 0]} stroke={colors.ink} strokeWidth={2} opacity={0.65} />
              <Line points={[0, h, w, h]} stroke={colors.ink} strokeWidth={2} opacity={0.65} />
            </>
          )}
          {def.text !== "" && (
            <KText
              text={l.text || def.text}
              width={w}
              height={h}
              align="center"
              verticalAlign="middle"
              fontSize={Math.max(8, w * def.textScale)}
              fontFamily={fontsReady ? konvaFontFamily(l.fontFamily) : "sans-serif"}
              fontStyle={def.weight >= 600 ? "bold" : "normal"}
              letterSpacing={def.letterSpacing}
              fill={colors.ink}
              wrap="none"
              ellipsis
            />
          )}
        </>
      ) : null}
    </Group>
  );
}

/** 누끼 PNG — same-origin 프록시 URL 이라 내보내기 taint 없음 */
function CutoutImage({ src, width, height }: { src: string | null; width: number; height: number }) {
  const [img] = useImage(src ?? "", "anonymous");
  if (!img) return <Rect width={width} height={height} fill="rgba(255,255,255,0.12)" dash={[12, 10]} stroke="rgba(255,255,255,0.5)" strokeWidth={3} />;
  return <KImage image={img} width={width} height={height} shadowColor="rgba(0,0,0,0.35)" shadowBlur={20} shadowOffsetY={10} />;
}

function IconImage({ iconKey, color, width, height }: { iconKey: string; color: string; width: number; height: number }) {
  const url = useMemo(() => iconSvgDataUrl(iconKey, color), [iconKey, color]);
  const [img] = useImage(url);
  if (!img) return null;
  return (
    <KImage image={img} width={width} height={height} shadowColor="rgba(0,0,0,0.3)" shadowBlur={12} shadowOffsetY={4} />
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
