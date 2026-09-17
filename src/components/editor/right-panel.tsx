"use client";

import { useRef, useState } from "react";
import { Download, Link as LinkIcon, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { FONT_FAMILIES, FONT_META, FORMAT_INFO, POST_FORMATS, type FontFamily, type PostBundle, type SlideDef, type SlideEditorState, type SlideLayer } from "@/types";
import { cssFontFamily } from "@/lib/render/export";
import { useEditorStore, selectSelectedLayer } from "@/stores/editor-store";
import { api, driveFileUrl } from "@/lib/client/api";
import { useInvalidatePosts, useSystemStatus } from "@/lib/client/queries";
import { CAPTION_MAX, HASHTAG_MAX } from "@/lib/metadata/approval-gate";
import { iconLabel, stickerDef } from "@/lib/render/stickers";
import { useAccount } from "@/lib/client/channel";
import { Segmented } from "@/components/md/segmented";
import { Collapsible, PaletteGrid, PanelLabel, RangeRow, fieldClass } from "@/components/md/primitives";
import { cn } from "@/lib/utils";
import { ElementsTab, LayersTab, PANEL_HINT, PresetsTab, type PanelTab } from "./panel-tabs";

const FONT_LABEL = (f: FontFamily) => `${FONT_META[f].label} · ${FONT_META[f].family}`;

/** 폰트 선택 리스트 — 미리보기 텍스트를 실제 폰트로 */
function FontList({ value, onChange, size = 15 }: { value: FontFamily; onChange: (f: FontFamily) => void; size?: number }) {
  return (
    <div className="flex max-h-[208px] flex-col gap-1 overflow-auto">
      {FONT_FAMILIES.map((f) => (
        <button key={f} type="button" onClick={() => onChange(f)} className={cn("flex items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-left hover:bg-fill", value === f ? "bg-fill" : "bg-fill-alt")}>
          <span className={cn("leading-tight", value === f && "text-brand")} style={{ fontFamily: cssFontFamily(f), fontSize: size }}>가나다 Magazine</span>
          <span className="shrink-0 text-[11px] text-label-alt">{FONT_META[f].label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * 오른쪽 패널 하나로 통합: 속성(선택된 것) · 프리셋 · 요소 · 레이어.
 * 캔버스에서 무언가를 선택하면 자동으로 "속성" 탭으로 온다.
 */
export function RightPanel({ slide, state, bundle, disabled, onDownload }: { slide: SlideDef | null; state: SlideEditorState | null; bundle: PostBundle; disabled: boolean; onDownload: () => void }) {
  const selection = useEditorStore((s) => s.selection);
  const setSelection = useEditorStore((s) => s.setSelection);
  const layer = useEditorStore(selectSelectedLayer);
  const [tab, setTab] = useState<PanelTab>("props");
  const [lastSel, setLastSel] = useState(selection);
  if (selection !== lastSel) {
    // 선택이 새로 생기면 속성 탭으로 (렌더 중 상태 파생 — effect 대신)
    setLastSel(selection);
    if (selection) setTab("props");
  }

  const title = selection?.kind === "text" ? "텍스트 레이어" : selection?.kind === "image" ? "이미지 레이어" : selection?.kind === "layer" ? "요소 레이어" : "포스트";
  const propsLabel = selection?.kind === "text" ? "텍스트" : selection?.kind === "image" ? "이미지" : selection?.kind === "layer" ? "요소" : "포스트";

  return (
    <aside className={cn("flex w-[340px] shrink-0 flex-col bg-surface", disabled && "pointer-events-none opacity-45")} style={{ boxShadow: "inset 1px 0 0 var(--semantic-line-solid-neutral)" }}>
      <div className="shrink-0 px-4 pb-2.5 pt-3.5">
        <Segmented
          value={tab}
          onChange={setTab}
          items={[
            { value: "props", label: propsLabel },
            { value: "presets", label: "프리셋" },
            { value: "elements", label: "요소" },
            { value: "layers", label: "레이어" },
          ]}
        />
      </div>
      {tab === "props" ? (
        <div className="flex items-center justify-between px-4 py-2" style={{ boxShadow: "inset 0 -1px 0 var(--semantic-line-solid-neutral)" }}>
          <span className="text-sm font-semibold">{title}</span>
          {selection && (
            <button type="button" onClick={() => setSelection(null)} className="flex items-center gap-1 rounded-full bg-fill py-[5px] pl-2 pr-2.5 text-xs font-semibold text-label-neutral hover:bg-fill-strong">
              <X className="size-3.5 opacity-60" />선택 해제 · Esc
            </button>
          )}
        </div>
      ) : (
        <p className="px-4 pb-2 text-xs leading-normal text-label-assistive">{PANEL_HINT[tab]}</p>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        {!slide || !state ? (
          <p className="p-4 text-xs text-label-assistive">슬라이드를 선택하세요.</p>
        ) : tab === "presets" ? (
          <div className="px-4 pb-4 pt-1"><PresetsTab slide={slide} /></div>
        ) : tab === "elements" ? (
          <div className="px-4 pb-4 pt-1"><ElementsTab slide={slide} bundle={bundle} /></div>
        ) : tab === "layers" ? (
          <div className="px-4 pb-4 pt-1"><LayersTab slide={slide} state={state} /></div>
        ) : selection?.kind === "text" ? (
          <TextPanel slide={slide} state={state} />
        ) : selection?.kind === "image" ? (
          <ImagePanel slide={slide} state={state} bundle={bundle} />
        ) : selection?.kind === "layer" && layer ? (
          <LayerPanel slide={slide} state={state} layer={layer} />
        ) : (
          <PostPanel onDownload={onDownload} />
        )}
      </div>
    </aside>
  );
}

// ---------------- 텍스트 ----------------
function TextPanel({ slide, state }: { slide: SlideDef; state: SlideEditorState }) {
  const updateSlideText = useEditorStore((s) => s.updateSlideText);
  const updateSlideState = useEditorStore((s) => s.updateSlideState);
  const t = state.text;
  const set = (patch: Partial<SlideEditorState["text"]>) => updateSlideState(slide.id, (s) => Object.assign(s.text, patch));
  const lines = slide.text.split("\n").length;
  const weightValue = t.weight >= 700 ? "Bold" : t.weight >= 500 ? "Medium" : "Regular";
  const alignValue = t.align === "left" ? "좌" : t.align === "center" ? "가운데" : "우";

  return (
    <div className="flex flex-col gap-[18px] px-4 pb-8 pt-4">
      <div className="flex flex-col gap-2">
        <PanelLabel>내용 · 수동 줄바꿈</PanelLabel>
        <textarea value={slide.text} onChange={(e) => updateSlideText(slide.id, e.target.value)} rows={3} className={cn(fieldClass, "resize-y leading-normal")} />
        {lines > 3 && <span className="text-xs text-negative">3줄을 넘으면 세이프 영역을 벗어나요.</span>}
      </div>
      <Collapsible title="폰트 · 이 레이어만" summary={FONT_LABEL(t.fontFamily)}>
        <FontList value={t.fontFamily} onChange={(f) => set({ fontFamily: f })} />
      </Collapsible>
      <RangeRow label="크기" value={t.fontSize} display={`${t.fontSize}px`} min={24} max={160} step={1} onChange={(v) => set({ fontSize: v })} />
      <RangeRow label="행간" value={t.lineHeight} display={t.lineHeight.toFixed(2)} min={0.9} max={2} step={0.05} onChange={(v) => set({ lineHeight: v })} />
      <RangeRow label="자간" value={t.letterSpacing} display={`${t.letterSpacing}px`} min={-6} max={4} step={0.5} onChange={(v) => set({ letterSpacing: v })} />
      <RangeRow label="박스 폭" value={t.width} display={`${Math.round((t.width / 1080) * 100)}%`} min={400} max={1080} step={10} onChange={(v) => set({ width: v })} />
      <div className="flex flex-col gap-2">
        <PanelLabel>굵기 · 정렬</PanelLabel>
        <Segmented value={weightValue} onChange={(v) => set({ weight: v === "Bold" ? 700 : v === "Medium" ? 500 : 400 })} items={["Regular", "Medium", "Bold"]} />
        <Segmented value={alignValue} onChange={(v) => set({ align: v === "좌" ? "left" : v === "가운데" ? "center" : "right" })} items={["좌", "가운데", "우"]} />
      </div>
      <Collapsible title="색" summary={<span className="size-3.5 rounded-full" style={{ background: t.color, boxShadow: "inset 0 0 0 1px rgba(23,23,25,0.2)" }} />}>
        <PaletteGrid value={t.color} onChange={(c) => set({ color: c })} />
      </Collapsible>
      <div className="grid grid-cols-3 gap-2">
        <NumField label="X" value={t.x} onChange={(v) => set({ x: v })} />
        <NumField label="Y" value={t.y} onChange={(v) => set({ y: v })} />
        <NumField label="W" value={t.width} onChange={(v) => set({ width: v })} />
      </div>
      <div className="flex items-center justify-between gap-3 pt-0.5">
        <span className="text-sm">레이어 잠금</span>
        <Toggle checked={t.locked} onChange={(v) => set({ locked: v })} label="레이어 잠금" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">프레임 선</span>
        <Toggle checked={t.frame} onChange={(v) => set({ frame: v })} label="프레임 선" />
      </div>
    </div>
  );
}

// ---------------- 이미지 ----------------
function ImagePanel({ slide, state, bundle }: { slide: SlideDef; state: SlideEditorState; bundle: PostBundle }) {
  const updateSlideState = useEditorStore((s) => s.updateSlideState);
  const setSlideAsset = useEditorStore((s) => s.setSlideAsset);
  const applyPreset = useEditorStore((s) => s.applyPreset);
  const markSaved = useEditorStore((s) => s.markSaved);
  const invalidate = useInvalidatePosts();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const im = state.image;
  const set = (fn: (i: SlideEditorState["image"]) => void) => updateSlideState(slide.id, (s) => fn(s.image));

  async function upload(file: File) {
    try {
      const res = await api.uploadAsset(bundle.metadata.post_id, file, slide.id);
      // 업로드가 updated_at 을 올리므로 낙관적 락 기준을 맞춘 뒤 슬라이드에 반영
      markSaved(res, useEditorStore.getState().snapshot);
      setSlideAsset(slide.id, res.uploaded);
      invalidate(bundle.metadata.post_id);
      toast.success(`이미지를 올렸어요 · ${res.uploaded}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  const dirValue = im.gradient.direction === "top" ? "위" : im.gradient.direction === "bottom" ? "아래" : im.gradient.direction === "full" ? "전체" : "없음";

  return (
    <div className="flex flex-col gap-[18px] px-4 pb-8 pt-4">
      <div className="flex flex-col gap-2">
        <PanelLabel>이미지 교체</PanelLabel>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) void upload(f); }}
          className={cn("grid h-[132px] w-full place-items-center rounded-xl border border-dashed text-xs text-label-assistive transition-colors", dragOver ? "border-brand bg-brand/5" : "border-line hover:bg-fill-alt")}
        >
          <span className="flex items-center gap-1.5"><Upload className="size-4" />이미지를 드래그하거나 클릭해 올리기</span>
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <div className="flex flex-wrap gap-1.5">
          {bundle.assets.map((a) => (
            <button key={a.fileId} type="button" title={a.name} onClick={() => setSlideAsset(slide.id, a.name)} className="size-[52px] overflow-hidden rounded-lg hairline-neutral" style={{ boxShadow: slide.asset === a.name ? "0 0 0 2px var(--semantic-primary-normal)" : undefined }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={driveFileUrl(a.fileId)} alt="" className="size-full object-cover" />
            </button>
          ))}
          {slide.asset && (
            <button type="button" title="이미지 제거 (텍스트만)" onClick={() => setSlideAsset(slide.id, null)} className="grid size-[52px] place-items-center rounded-lg bg-fill-alt text-label-alt hover:bg-fill">
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>
      <RangeRow label="줌" value={im.zoom} display={`${im.zoom.toFixed(2)}×`} min={1} max={3} step={0.01} onChange={(v) => set((i) => { i.zoom = v; })} />
      <RangeRow label="밝기" value={im.brightness} display={signed(im.brightness * 100)} min={-0.6} max={0.6} step={0.01} onChange={(v) => set((i) => { i.brightness = v; })} hint="제안 −8" onHint={() => set((i) => { i.brightness = -0.08; })} />
      <RangeRow label="대비" value={im.contrast} display={signed(im.contrast)} min={-60} max={60} step={1} onChange={(v) => set((i) => { i.contrast = v; })} hint="제안 +12" onHint={() => set((i) => { i.contrast = 12; })} />
      <RangeRow label="채도" value={im.saturation} display={signed(im.saturation * 100)} min={-1} max={1} step={0.05} onChange={(v) => set((i) => { i.saturation = v; })} hint="제안 −20" onHint={() => set((i) => { i.saturation = -0.2; })} />
      <RangeRow label="다크 오버레이" value={im.overlay.opacity} display={`${Math.round(im.overlay.opacity * 100)}%`} min={0} max={0.8} step={0.01} onChange={(v) => set((i) => { i.overlay.opacity = v; })} hint="제안 40%" onHint={() => set((i) => { i.overlay.opacity = 0.4; })} />
      <RangeRow label="그라디언트 강도" value={im.gradient.opacity} display={`${Math.round(im.gradient.opacity * 100)}%`} min={0} max={1} step={0.01} onChange={(v) => set((i) => { i.gradient.opacity = v; })} hint="제안 65%" onHint={() => set((i) => { i.gradient.opacity = 0.65; })} />
      <RangeRow label="블러" value={im.blur} display={`${im.blur}px`} min={0} max={30} step={1} onChange={(v) => set((i) => { i.blur = v; })} />
      <div className="flex flex-col gap-2">
        <PanelLabel>그라디언트 방향</PanelLabel>
        <Segmented value={dirValue} onChange={(v) => set((i) => { i.gradient.direction = v === "위" ? "top" : v === "아래" ? "bottom" : v === "전체" ? "full" : "none"; })} items={["위", "아래", "전체", "없음"]} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2 text-xs text-label-alt">
          오버레이 색
          <input type="color" value={im.overlay.color} onChange={(e) => set((i) => { i.overlay.color = e.target.value; })} className="size-7 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
        </label>
        <label className="flex items-center gap-2 text-xs text-label-alt">
          배경색
          <input type="color" value={im.background} onChange={(e) => set((i) => { i.background = e.target.value; })} className="size-7 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => set((i) => { i.pan = { x: 0, y: 0 }; i.zoom = 1; })} className="h-[34px] rounded-lg text-[13px] font-semibold text-label-neutral hairline hover:bg-fill-alt">크롭 초기화</button>
        <button type="button" onClick={() => applyPreset(slide.id, slide.style_preset, true)} className="h-[34px] rounded-lg text-[13px] font-semibold text-label-neutral hairline hover:bg-fill-alt">프리셋 값으로 리셋</button>
      </div>
    </div>
  );
}

// ---------------- 요소 레이어 ----------------
function LayerPanel({ slide, state, layer: L }: { slide: SlideDef; state: SlideEditorState; layer: SlideLayer }) {
  const updateLayer = useEditorStore((s) => s.updateLayer);
  const removeLayer = useEditorStore((s) => s.removeLayer);
  const moveLayer = useEditorStore((s) => s.moveLayer);
  const channel = useEditorStore((s) => s.snapshot?.metadata.channel);
  const channelColor = useAccount(channel)?.color ?? "#171717";
  const set = (patch: Partial<SlideLayer>) => updateLayer(slide.id, L.id, patch);
  const def = L.kind === "sticker" ? stickerDef(L.key) : null;
  const name = L.kind === "cutout" ? "누끼 PNG" : L.kind === "icon" ? `아이콘 · ${iconLabel(L.key)}` : `스티커 · ${def?.label ?? ""}`;
  const idx = state.layers.findIndex((l) => l.id === L.id);
  const hasText = !!def && def.text !== "";
  const colorLabel = L.kind === "icon" ? "아이콘 색" : def?.useColor ? "배경색" : "글자색";

  return (
    <div className="flex flex-col gap-[18px] px-4 pb-8 pt-4">
      <div className="flex items-center gap-2.5 rounded-xl bg-fill-alt px-3 py-2.5">
        <span className="flex-1 text-[13px] font-semibold">{name}</span>
        <span className="text-[11px] text-label-alt">순서 {idx + 1} / {state.layers.length}</span>
      </div>
      {L.kind === "cutout" && <span className="text-xs leading-normal text-label-assistive">브라우저에서 배경을 지운 투명 PNG예요. 크기·회전은 선택 프레임으로도 조정할 수 있어요.</span>}
      <RangeRow label="크기" value={L.width} display={`${Math.round((L.width / 1080) * 100)}%`} min={60} max={1080} step={2} onChange={(v) => set({ width: v, height: L.height !== undefined ? Math.round((L.height * v) / L.width) : undefined })} />
      <RangeRow label="회전" value={L.rotation} display={`${L.rotation}°`} min={-180} max={180} step={1} onChange={(v) => set({ rotation: v })} />
      <RangeRow label="불투명도" value={L.opacity} display={`${Math.round(L.opacity * 100)}%`} min={0.1} max={1} step={0.01} onChange={(v) => set({ opacity: v })} />
      {hasText && (
        <>
          <div className="flex flex-col gap-2">
            <PanelLabel>글자</PanelLabel>
            <input value={L.text} onChange={(e) => set({ text: e.target.value })} placeholder="스티커에 쓸 문구" className={fieldClass} />
          </div>
          <Collapsible title="폰트 · 이 레이어만" summary={FONT_LABEL(L.fontFamily)}>
            <FontList value={L.fontFamily} onChange={(f) => set({ fontFamily: f })} size={14} />
          </Collapsible>
        </>
      )}
      {L.kind !== "cutout" && <Collapsible title={colorLabel} summary={<span className="size-3.5 rounded-full" style={{ background: L.color, boxShadow: "inset 0 0 0 1px rgba(23,23,25,0.2)" }} />}>
        <PaletteGrid value={L.color} onChange={(c) => set({ color: c })} extra={channelColor} />
      </Collapsible>}
      <Collapsible title="정렬 · 순서">
        <div className="grid grid-cols-2 gap-2">
          <PanelButton onClick={() => set({ flip: !L.flip })}>좌우 반전</PanelButton>
          <PanelButton onClick={() => set({ x: 540 })}>가운데로</PanelButton>
          <PanelButton onClick={() => moveLayer(slide.id, L.id, 1)}>앞으로</PanelButton>
          <PanelButton onClick={() => moveLayer(slide.id, L.id, -1)}>뒤로</PanelButton>
        </div>
      </Collapsible>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">레이어 잠금</span>
        <Toggle checked={L.locked} onChange={(v) => set({ locked: v })} label="레이어 잠금" />
      </div>
      <button type="button" onClick={() => removeLayer(slide.id, L.id)} className="flex items-center justify-center gap-1.5 rounded-[10px] py-2.5 text-[13px] font-semibold text-negative" style={{ background: "var(--semantic-background-status-negative)" }}>
        <Trash2 className="size-4" />레이어 삭제
      </button>
    </div>
  );
}

// ---------------- 포스트 ----------------
function PostPanel({ onDownload }: { onDownload: () => void }) {
  const snap = useEditorStore((s) => s.snapshot);
  const updateMetadata = useEditorStore((s) => s.updateMetadata);
  const setFactCheck = useEditorStore((s) => s.setFactCheck);
  const setFormat = useEditorStore((s) => s.setFormat);
  const status = useSystemStatus();
  if (!snap) return null;
  const m = snap.metadata;
  const src = snap.sources;
  const captionTotal = m.caption.length + m.hashtags.reduce((n, h) => n + h.length + 2, 0);
  const channelTags = status.data?.accounts.find((a) => a.key === m.channel)?.default_hashtags ?? [];

  return (
    <div className="flex flex-col gap-[18px] px-4 pb-8 pt-4">
      <div className="flex flex-col gap-2">
        <PanelLabel>피드 규격 · 포스트 전체</PanelLabel>
        <Segmented value={m.format} onChange={(f) => setFormat(f)} items={POST_FORMATS.map((f) => ({ value: f, label: f }))} />
        <div className="flex items-center justify-between rounded-xl bg-fill-alt px-3 py-2.5 text-[13px]">
          <span className="font-semibold">{FORMAT_INFO[m.format].label}</span>
          <span className="text-label-alt">{FORMAT_INFO[m.format].hint.split(" · ")[0]}</span>
        </div>
        <span className="text-[11px] leading-normal text-label-assistive">{FORMAT_INFO[m.format].hint}. 캐러셀은 모든 장이 같은 비율이어야 해서 포스트 단위로 바뀌어요. 프로필 그리드는 3:4로 잘려 보여요.</span>
      </div>
      <div className="flex flex-col gap-2">
        <PanelLabel>헤드라인 (카드 표시용)</PanelLabel>
        <textarea value={m.headline} onChange={(e) => updateMetadata({ headline: e.target.value })} rows={2} className={cn(fieldClass, "resize-none")} />
      </div>
      <div className="flex flex-col gap-2">
        <PanelLabel>주제</PanelLabel>
        <input value={m.topic} onChange={(e) => updateMetadata({ topic: e.target.value })} className={fieldClass} />
      </div>
      <div className="flex flex-col gap-2">
        <PanelLabel right={<span className={cn("text-xs tabular-nums", captionTotal > CAPTION_MAX ? "text-negative" : "text-label-assistive")}>{captionTotal.toLocaleString()} / {CAPTION_MAX.toLocaleString()}</span>}>캡션</PanelLabel>
        <textarea value={m.caption} onChange={(e) => updateMetadata({ caption: e.target.value })} rows={7} className={cn(fieldClass, "resize-y leading-relaxed")} />
      </div>
      <div className="flex flex-col gap-2">
        <PanelLabel right={<span className={cn("text-xs tabular-nums", m.hashtags.length > HASHTAG_MAX ? "text-negative" : "text-label-assistive")}>{m.hashtags.length} / {HASHTAG_MAX}</span>}>해시태그</PanelLabel>
        <div className="flex flex-wrap gap-1.5">
          {m.hashtags.map((t) => (
            <span key={t} className="flex h-[26px] items-center gap-1 rounded-md pl-2 pr-1 text-xs font-medium hairline">
              #{t}
              <button type="button" title="삭제" onClick={() => updateMetadata({ hashtags: m.hashtags.filter((x) => x !== t) })} className="grid size-4 place-items-center rounded text-label-assistive hover:text-label"><X className="size-3" /></button>
            </span>
          ))}
        </div>
        <TagInput onAdd={(tags) => updateMetadata({ hashtags: [...new Set([...m.hashtags, ...tags])] })} />
        {channelTags.length > 0 && (
          <button type="button" onClick={() => updateMetadata({ hashtags: [...new Set([...m.hashtags, ...channelTags])] })} className="self-start rounded-lg bg-fill-alt px-2.5 py-[5px] text-xs font-semibold text-brand hover:bg-fill">
            채널 기본 태그 넣기
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <PanelLabel>대체 텍스트</PanelLabel>
        <input value={m.alt_text ?? ""} onChange={(e) => updateMetadata({ alt_text: e.target.value || undefined })} placeholder="사진을 한 문장으로 설명" className={fieldClass} />
      </div>
      <div className="overflow-hidden rounded-xl bg-fill-alt">
        <Collapsible title={<span className="text-[13px] font-semibold text-label">참고 출처 {src.items.length}건{m.fact_check_required ? " · 팩트체크 필수" : ""}</span>}>
          <div className="flex flex-col gap-2.5 px-1 pb-2">
            {src.items.length === 0 && <span className="text-xs text-label-assistive">등록된 출처가 없어요.</span>}
            {src.items.map((s, i) => (
              <a key={i} href={s.url || "#"} target={s.url ? "_blank" : undefined} rel="noreferrer" className="flex items-center gap-2 text-[13px] leading-snug text-brand hover:text-brand-strong">
                <LinkIcon className="size-3.5 shrink-0 opacity-60" />
                <span className="truncate">{s.publisher ? `${s.publisher} · ` : ""}{s.title || s.url}</span>
              </a>
            ))}
            <span className="text-[11px] text-label-assistive">ChatGPT가 남긴 링크예요 · 읽기 전용</span>
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs font-semibold text-label-alt">팩트체크</span>
              <Segmented
                className="max-w-[200px]"
                value={src.fact_check_status}
                onChange={(v) => setFactCheck(v)}
                items={[{ value: "pending", label: "대기" }, { value: "approved", label: "승인" }, { value: "rejected", label: "반려" }]}
              />
            </div>
            <textarea value={src.reviewer_note} onChange={(e) => setFactCheck(src.fact_check_status, e.target.value)} rows={2} placeholder="검토 메모" className={cn(fieldClass, "resize-none text-xs")} />
          </div>
        </Collapsible>
      </div>
      <button type="button" onClick={onDownload} className="flex h-[34px] items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold text-label-neutral hairline hover:bg-fill-alt">
        <Download className="size-3.5" />JPEG 내려받기 · {m.slides.length}장
      </button>
    </div>
  );
}

function TagInput({ onAdd }: { onAdd: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const tags = [...new Set(draft.split(/[\s,]+/).map((t) => t.replace(/^#/, "").trim()).filter(Boolean))];
    if (tags.length) onAdd(tags);
    setDraft("");
  };
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
      placeholder="태그 추가 · Enter"
      className={cn(fieldClass, "py-2 text-xs")}
    />
  );
}

function PanelButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-[10px] bg-fill-alt py-2.5 text-[13px] font-medium hover:bg-fill">{children}</button>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cn("relative h-8 w-[52px] shrink-0 rounded-full transition-colors duration-200", checked ? "bg-brand" : "bg-fill-strong")}>
      <span className={cn("absolute top-1 size-6 rounded-full bg-white shadow-e-xs transition-transform duration-200", checked ? "translate-x-[24px]" : "translate-x-1")} />
    </button>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-1.5 rounded-lg bg-fill-alt px-2 py-1">
      <span className="text-[11px] text-label-alt">{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full bg-transparent text-xs tabular-nums outline-none" />
    </label>
  );
}

function signed(v: number): string {
  const r = Math.round(v);
  return r > 0 ? `+${r}` : String(r);
}
