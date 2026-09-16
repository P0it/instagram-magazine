"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, Trash2, X } from "lucide-react";
import type { SlideDef, SlideEditorState, SlideLayer } from "@/types";
import { useEditorStore, type Selection } from "@/stores/editor-store";
import { stickerColors, stickerDef, iconLabel } from "@/lib/render/stickers";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "@/types";
import { ChipButton, GhostIcon } from "@/components/md/primitives";
import { SlideCanvas } from "./canvas";
import { cn } from "@/lib/utils";

type Zoom = "fit" | "75" | "50";
const SWATCHES = ["#FFFFFF", "#171719", "#0066FF", "#00BDDE", "#F553DA", "#FF9500"];

export function StageArea({
  slide,
  state,
  imageUrl,
  readOnly,
  slideIndex,
  slideCount,
  onPrev,
  onNext,
  selection,
  selectedLayer,
}: {
  slide: SlideDef | null;
  state: SlideEditorState | null;
  imageUrl: string | null;
  readOnly: boolean;
  slideIndex: number;
  slideCount: number;
  onPrev: () => void;
  onNext: () => void;
  selection: Selection;
  selectedLayer: SlideLayer | null;
}) {
  const setSelection = useEditorStore((s) => s.setSelection);
  const updateSlideState = useEditorStore((s) => s.updateSlideState);
  const updateLayer = useEditorStore((s) => s.updateLayer);
  const removeLayer = useEditorStore((s) => s.removeLayer);
  const duplicateLayer = useEditorStore((s) => s.duplicateLayer);
  const moveLayer = useEditorStore((s) => s.moveLayer);
  const applyPreset = useEditorStore((s) => s.applyPreset);

  const host = useRef<HTMLDivElement>(null);
  const [fitWidth, setFitWidth] = useState(480);
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [showSafe, setShowSafe] = useState(true);
  const [guides, setGuides] = useState({ v: false, h: false });
  // 팔레트는 선택이 바뀌면 닫힌다 (선택 객체를 함께 기억해 렌더 중에 파생)
  const [paletteState, setPaletteState] = useState<{ sel: Selection; p: "text" | "bg" | "ink" | null }>({ sel: null, p: null });
  const palette = paletteState.sel === selection ? paletteState.p : null;
  const setPalette = (fn: (p: "text" | "bg" | "ink" | null) => "text" | "bg" | "ink" | null) => setPaletteState({ sel: selection, p: fn(palette) });
  const [recent, setRecent] = useState<string[]>([]);

  // 캔버스 크기 반응형: 스테이지 영역에 맞춤
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = e.contentRect.width - 16;
      const h = e.contentRect.height - 20;
      setFitWidth(Math.max(160, Math.floor(Math.min(w, (h * CANVAS_WIDTH) / CANVAS_HEIGHT))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const displayWidth = zoom === "fit" ? fitWidth : Math.round(fitWidth * (parseInt(zoom, 10) / 100));
  const editable = !readOnly && !!slide;

  const tx = state?.text;
  const setText = (patch: Partial<SlideEditorState["text"]>) => slide && updateSlideState(slide.id, (s) => Object.assign(s.text, patch));
  const setImg = (patch: Partial<SlideEditorState["image"]>) => slide && updateSlideState(slide.id, (s) => Object.assign(s.image, patch));
  const L = selectedLayer;
  const def = L?.kind === "sticker" ? stickerDef(L.key) : null;
  const layerColors = L && def ? stickerColors(def, L) : null;

  const selName =
    selection?.kind === "text" ? "텍스트" : selection?.kind === "image" ? "배경 이미지" : L ? (L.kind === "icon" ? `아이콘 · ${iconLabel(L.key)}` : `스티커 · ${def?.label ?? ""}`) : "";

  const pushRecent = (c: string) => setRecent((r) => [c, ...r.filter((x) => x.toUpperCase() !== c.toUpperCase())].slice(0, 8));
  const applyColor = (c: string) => {
    if (!slide) return;
    pushRecent(c);
    if (palette === "text") setText({ color: c });
    else if (L && palette === "bg") updateLayer(slide.id, L.id, { bg: c });
    else if (L && palette === "ink") updateLayer(slide.id, L.id, L.kind === "icon" ? { color: c } : { ink: c });
  };
  const currentPaletteColor = palette === "text" ? tx?.color : L ? (palette === "bg" ? (L.bg ?? layerColors?.bg ?? "none") : L.kind === "icon" ? L.color : (L.ink ?? layerColors?.ink)) : undefined;

  return (
    <section className="relative flex min-w-0 flex-1 flex-col items-center gap-3.5 overflow-hidden px-6 pt-4 pb-4">
      {/* 선택 툴바 */}
      <div className="relative z-[8] flex h-10 w-full shrink-0 items-center justify-center">
        {selection && slide && !readOnly && (
          <div className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl bg-surface p-1 shadow-e-sm">
            <span className="max-w-[120px] truncate px-1.5 text-[11px] font-semibold text-label-neutral">{selName}</span>
            <div className="h-[18px] w-px bg-line" />
            {selection.kind === "image" && (
              <button
                type="button"
                onClick={() => slide && applyPreset(slide.id, slide.style_preset, true)}
                className="h-7 whitespace-nowrap rounded-lg px-2.5 text-[11px] font-semibold text-label-alt hover:bg-fill"
                title="프리셋 값으로 리셋"
              >
                리셋
              </button>
            )}
            {selection.kind === "text" && tx && (
              <>
                <button type="button" title="크기 줄이기" onClick={() => setText({ fontSize: Math.max(24, tx.fontSize - 4) })} className="size-7 rounded-lg text-xs font-bold hover:bg-fill">A−</button>
                <span className="min-w-[30px] text-center text-[11px] font-semibold tabular-nums text-label-neutral">{Math.round(tx.fontSize)}</span>
                <button type="button" title="크기 키우기" onClick={() => setText({ fontSize: Math.min(200, tx.fontSize + 4) })} className="size-7 rounded-lg text-sm font-bold hover:bg-fill">A+</button>
                <div className="flex items-center gap-0.5 rounded-lg bg-fill-alt p-0.5">
                  {(["left", "center", "right"] as const).map((a) => (
                    <button
                      key={a}
                      type="button"
                      title={`${a === "left" ? "좌" : a === "center" ? "가운데" : "우"} 정렬`}
                      onClick={() => setText({ align: a })}
                      className={cn("grid h-6 w-[26px] place-items-center rounded-md", tx.align === a ? "bg-surface text-brand shadow-e-xs" : "text-label-alt")}
                    >
                      <AlignGlyph align={a} />
                    </button>
                  ))}
                </div>
                <ColorChip title="글자색" active={palette === "text"} onClick={() => setPalette((p) => (p === "text" ? null : "text"))} color={tx.color} glyph="T" />
                <button
                  type="button"
                  title="잠금"
                  onClick={() => setText({ locked: !tx.locked })}
                  className={cn("h-7 rounded-lg px-2 text-[11px] font-semibold hover:bg-fill", tx.locked ? "bg-fill text-brand" : "text-label-alt")}
                >
                  {tx.locked ? "잠김" : "잠금"}
                </button>
              </>
            )}
            {L && (
              <>
                {L.kind === "sticker" && <ColorChip title="배경색" active={palette === "bg"} onClick={() => setPalette((p) => (p === "bg" ? null : "bg"))} color={layerColors?.bg ?? "none"} />}
                <ColorChip title={L.kind === "icon" ? "아이콘 색" : "글자색"} active={palette === "ink"} onClick={() => setPalette((p) => (p === "ink" ? null : "ink"))} color={L.kind === "icon" ? L.color : (layerColors?.ink ?? "#fff")} glyph="T" />
                <GhostIcon title="복제 (⌘D)" className="size-7" onClick={() => duplicateLayer(slide.id, L.id)}><Copy className="size-[15px] opacity-75" /></GhostIcon>
                <GhostIcon title="앞으로" className="size-7" onClick={() => moveLayer(slide.id, L.id, 1)}><ChevronUp className="size-[15px] opacity-75" /></GhostIcon>
                <GhostIcon title="뒤로" className="size-7" onClick={() => moveLayer(slide.id, L.id, -1)}><ChevronDown className="size-[15px] opacity-75" /></GhostIcon>
                <GhostIcon title="삭제 (Delete)" className="size-7" danger onClick={() => removeLayer(slide.id, L.id)}><Trash2 className="size-[15px] opacity-75" /></GhostIcon>
              </>
            )}
            <GhostIcon title="선택 해제 · Esc" className="size-7" onClick={() => setSelection(null)}><X className="size-[14px] opacity-60" /></GhostIcon>
          </div>
        )}

        {/* 이미지 빠른 보정 */}
        {selection?.kind === "image" && state && !readOnly && (
          <div className="absolute left-1/2 top-[42px] z-[9] flex -translate-x-1/2 flex-col gap-1.5 rounded-xl bg-surface px-3 py-2.5 shadow-e-sm">
            <Quick label="밝기" min={-0.6} max={0.6} step={0.01} value={state.image.brightness} display={pct(state.image.brightness, 100)} onChange={(v) => setImg({ brightness: v })} />
            <Quick label="대비" min={-60} max={60} step={1} value={state.image.contrast} display={pct(state.image.contrast, 1)} onChange={(v) => setImg({ contrast: v })} />
            <Quick label="채도" min={-1} max={1} step={0.05} value={state.image.saturation} display={pct(state.image.saturation, 100)} onChange={(v) => setImg({ saturation: v })} />
          </div>
        )}

        {/* 색 팔레트 팝오버 */}
        {palette && (
          <div className="absolute left-1/2 top-[42px] z-[9] flex -translate-x-1/2 flex-col gap-2 whitespace-nowrap rounded-xl bg-surface px-3 py-2.5 shadow-e-sm">
            <div className="flex items-center gap-2">
              <span className="w-[30px] text-[10px] font-semibold text-label-alt">{palette === "bg" ? "배경색" : "글자색"}</span>
              <div className="flex items-center gap-1.5">
                {(palette === "bg" ? ["none", ...SWATCHES] : SWATCHES).map((c) => (
                  <Swatch key={c} color={c} square={palette === "bg"} on={String(currentPaletteColor ?? "").toUpperCase() === c.toUpperCase()} onClick={() => applyColor(c)} />
                ))}
              </div>
              <div className="h-5 w-px bg-line" />
              <label title="직접 고르기" className="relative size-6 shrink-0 cursor-pointer overflow-hidden rounded-full" style={{ background: "conic-gradient(#FF3B30, #FF9500, #FFD60A, #34C759, #00BDDE, #0066FF, #AF52DE, #F553DA, #FF3B30)", boxShadow: "inset 0 0 0 1px rgba(23,23,25,0.18)" }}>
                <input type="color" onChange={(e) => applyColor(e.target.value.toUpperCase())} className="absolute -inset-1.5 size-[200%] cursor-pointer opacity-0" />
              </label>
            </div>
            {recent.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-[30px] text-[10px] font-semibold text-label-alt">최근</span>
                <div className="flex items-center gap-1.5">
                  {recent.map((c) => <Swatch key={c} color={c} square={palette === "bg"} on={false} onClick={() => applyColor(c)} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 캔버스 */}
      <div ref={host} className="relative grid min-h-0 w-full flex-1 place-items-center py-2">
        {slide && state ? (
          <div className="relative overflow-hidden rounded-[4px] shadow-e-md" style={{ width: displayWidth }}>
            <SlideCanvas
              slideState={state}
              text={slide.text}
              imageUrl={imageUrl}
              displayWidth={displayWidth}
              editable={editable}
              selection={selection}
              onSelect={setSelection}
              showSafeArea={showSafe}
              onGuides={setGuides}
              onTextChange={(patch) => setText(patch)}
              onImageChange={(patch) => setImg(patch)}
              onLayerChange={(id, patch) => updateLayer(slide.id, id, patch)}
            />
            {guides.v && <div className="pointer-events-none absolute inset-y-0 left-1/2 z-[5] w-px" style={{ background: "var(--semantic-accent-background-pink)" }} />}
            {guides.h && <div className="pointer-events-none absolute inset-x-0 top-1/2 z-[5] h-px" style={{ background: "var(--semantic-accent-background-pink)" }} />}
            {showSafe && (
              <span className="pointer-events-none absolute left-[calc(6%+4px)] top-[calc(6%+4px)] rounded-[5px] px-[5px] py-0.5 text-[10px] font-semibold tracking-[0.02em] text-white backdrop-blur-[32px]" style={{ background: "rgba(23,23,25,0.55)" }}>
                안전 영역
              </span>
            )}
            {slideCount > 1 && (
              <>
                <button type="button" title="이전 슬라이드" onClick={onPrev} className={cn("group absolute inset-y-0 left-0 z-[4] flex w-[max(13%,44px)] items-center justify-start pl-2.5 opacity-0 transition-opacity hover:opacity-100", slideIndex === 0 && "hover:opacity-35")} style={{ background: "linear-gradient(90deg, rgba(23,23,25,0.5), rgba(23,23,25,0))" }}>
                  <ChevronLeft className="size-[22px] text-white opacity-85" />
                </button>
                <button type="button" title="다음 슬라이드" onClick={onNext} className={cn("group absolute inset-y-0 right-0 z-[4] flex w-[max(13%,44px)] items-center justify-end pr-2.5 opacity-0 transition-opacity hover:opacity-100", slideIndex === slideCount - 1 && "hover:opacity-35")} style={{ background: "linear-gradient(270deg, rgba(23,23,25,0.5), rgba(23,23,25,0))" }}>
                  <ChevronRight className="size-[22px] text-white opacity-85" />
                </button>
                <span className="pointer-events-none absolute right-2.5 top-2.5 z-[5] rounded-full px-[9px] py-1 text-[11px] font-semibold text-white backdrop-blur-[32px]" style={{ background: "rgba(23,23,25,0.52)" }}>
                  {slideIndex + 1} / {slideCount}
                </span>
              </>
            )}
          </div>
        ) : (
          <div className="text-sm text-label-alt">슬라이드를 추가하세요</div>
        )}
      </div>

      {/* 하단 컨트롤 */}
      <div className="flex h-8 max-w-full shrink-0 items-center gap-2.5 overflow-hidden">
        <span className="shrink-0 whitespace-nowrap text-xs text-label-alt">4:5 · 1080 × 1350</span>
        <div className="h-3.5 w-px shrink-0 bg-line" />
        <span className="min-w-0 flex-1 truncate text-xs text-label-assistive">캔버스 전체가 업로드돼요 · 좌우 끝 클릭으로 슬라이드 이동</span>
        <ChipButton title="배경 이미지 보정 (밝기 · 대비 · 채도)" on={selection?.kind === "image"} onClick={() => setSelection({ kind: "image" })} className={cn(selection?.kind === "image" && "text-brand")}>배경 보정</ChipButton>
        <ChipButton title="안전 영역 표시" on={showSafe} onClick={() => setShowSafe((v) => !v)}>안전 영역</ChipButton>
        <div className="flex shrink-0 items-center gap-0.5">
          {(["fit", "75", "50"] as Zoom[]).map((z) => (
            <ChipButton key={z} on={zoom === z} onClick={() => setZoom(z)}>{z === "fit" ? "맞춤" : `${z}%`}</ChipButton>
          ))}
        </div>
      </div>
    </section>
  );
}

function pct(v: number, mul: number): string {
  return `${Math.round(v * mul) > 0 ? "+" : ""}${Math.round(v * mul)}`;
}

function Quick({ label, min, max, step, value, display, onChange }: { label: string; min: number; max: number; step: number; value: number; display: string; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-7 whitespace-nowrap text-[11px] font-semibold text-label-alt">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="!h-4 !w-[132px]" />
      <span className="w-[30px] text-right text-[11px] font-semibold tabular-nums text-label-neutral">{display}</span>
    </div>
  );
}

function ColorChip({ title, active, onClick, color, glyph }: { title: string; active: boolean; onClick: () => void; color: string; glyph?: string }) {
  const ground = chipGround(color);
  return (
    <button type="button" title={title} onClick={onClick} className={cn("grid size-7 place-items-center rounded-lg hover:bg-fill", active && "bg-fill")}>
      {glyph ? (
        <span className="grid size-5 place-items-center rounded-md hairline-neutral" style={{ background: ground }}>
          <span className="text-[13px] font-bold leading-none" style={{ color }}>{glyph}</span>
        </span>
      ) : (
        <span className="size-5 rounded-md hairline-neutral" style={{ background: color === "none" ? "repeating-conic-gradient(#E8E9EB 0% 25%, #fff 0% 50%) 50%/8px 8px" : color }} />
      )}
    </button>
  );
}

function Swatch({ color, square, on, onClick }: { color: string; square: boolean; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={color === "none" ? "배경 없음" : color}
      onClick={onClick}
      className={cn("size-6 shrink-0", square ? "rounded-md" : "rounded-full")}
      style={{
        background: color === "none" ? "repeating-conic-gradient(#E8E9EB 0% 25%, #fff 0% 50%) 50%/8px 8px" : color,
        boxShadow: on ? "inset 0 0 0 1px rgba(23,23,25,0.18), 0 0 0 2px var(--semantic-primary-normal)" : "inset 0 0 0 1px rgba(23,23,25,0.18)",
      }}
    />
  );
}

function AlignGlyph({ align }: { align: "left" | "center" | "right" }) {
  const items = align === "left" ? "flex-start" : align === "center" ? "center" : "flex-end";
  return (
    <span className="flex w-3.5 flex-col gap-0.5" style={{ alignItems: items }}>
      <span className="h-[1.5px] w-full rounded-px bg-current" />
      <span className="h-[1.5px] w-[62%] rounded-px bg-current" />
      <span className="h-[1.5px] w-[86%] rounded-px bg-current" />
    </span>
  );
}

function chipGround(c: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  if (!m) return "var(--semantic-fill-alternative)";
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.58 ? "#15161A" : "#E8E9EB";
}
