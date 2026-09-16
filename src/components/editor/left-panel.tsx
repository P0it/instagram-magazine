"use client";

import { useRef, useState } from "react";
import { Eye, EyeOff, Scissors, Trash2, Type, Upload } from "lucide-react";
import { toast } from "sonner";
import { LAYOUT_PRESETS } from "@/presets";
import { SlideRoleSchema, type PresetId, type SlideDef, type SlideEditorState, type SlideRole, type StickerKey } from "@/types";
import { useEditorStore } from "@/stores/editor-store";
import { api, driveFileUrl } from "@/lib/client/api";
import { qk, useCustomPresets, useInvalidatePosts } from "@/lib/client/queries";
import { useQueryClient } from "@tanstack/react-query";
import { removeBackgroundToPng } from "@/lib/render/cutout";
import { ICONS, STICKERS, iconLabel, stickerDef } from "@/lib/render/stickers";
import { ICON_COMPONENTS } from "@/lib/render/icon-svg";
import { CHANNEL_META } from "@/lib/client/channel";
import { Segmented } from "@/components/md/segmented";
import { PanelLabel, fieldClass } from "@/components/md/primitives";
import { cn } from "@/lib/utils";

export type LeftTab = "presets" | "elements" | "layers";

const ROLE_LABEL: Record<SlideRole, string> = { cover: "커버", photo: "사진", info: "정보", quote: "인용", screenshot: "스크린샷", closing: "클로징" };

const HINT: Record<LeftTab, string> = {
  presets: "프리셋을 고르거나, 역할을 바꿔 채널 스타일팩 기본값을 적용하세요.",
  elements: "눌러서 캔버스에 얹고, 끌어서 옮기세요. 방향키로 4px씩 이동.",
  layers: "이 슬라이드의 레이어 순서와 표시를 관리해요.",
};

export function LeftPanel({ tab, onTab, slide, state, bundle, disabled }: { tab: LeftTab; onTab: (t: LeftTab) => void; slide: SlideDef | null; state: SlideEditorState | null; bundle: PostBundle; disabled: boolean }) {
  return (
    <aside className={cn("flex w-[260px] shrink-0 flex-col bg-surface", disabled && "pointer-events-none opacity-45")} style={{ boxShadow: "inset -1px 0 0 var(--semantic-line-solid-neutral)" }}>
      <div className="flex shrink-0 flex-col gap-2.5 px-4 pb-2.5 pt-3.5">
        <Segmented value={tab} onChange={onTab} items={[{ value: "presets", label: "프리셋" }, { value: "elements", label: "요소" }, { value: "layers", label: "레이어" }]} />
        <p className="text-xs leading-normal text-label-assistive">{HINT[tab]}</p>
      </div>
      <div className="flex-1 overflow-auto px-4 pb-4 pt-1">
        {!slide || !state ? (
          <p className="text-xs text-label-assistive">슬라이드를 선택하세요.</p>
        ) : tab === "presets" ? (
          <PresetsTab slide={slide} />
        ) : tab === "elements" ? (
          <ElementsTab slide={slide} bundle={bundle} />
        ) : (
          <LayersTab slide={slide} state={state} />
        )}
      </div>
    </aside>
  );
}

// ---------------- 프리셋 ----------------
function PresetsTab({ slide }: { slide: SlideDef }) {
  const applyPreset = useEditorStore((s) => s.applyPreset);
  const applyCustomPreset = useEditorStore((s) => s.applyCustomPreset);
  const updateSlideRole = useEditorStore((s) => s.updateSlideRole);
  const [withImage, setWithImage] = useState(true);
  const custom = useCustomPresets();
  const qc = useQueryClient();
  const shotRef = useRef<HTMLInputElement>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [draft, setDraft] = useState<{ analysis: LayoutAnalysis; base: PresetId; overrides: CustomPreset["overrides"]; provider: "sdk" | "cli"; name: string } | null>(null);
  const presets = custom.data?.presets ?? [];
  const activeCustom = presets.find((p) => p.base === slide.style_preset && slide.overrides && JSON.stringify(p.overrides) === JSON.stringify(slide.overrides));

  const analyze = async (file: File) => {
    if (analyzing) return;
    setAnalyzing(true);
    try {
      const r = await api.analyzeScreenshot(file);
      setDraft({ ...r, name: `내 프리셋 ${presets.length + 1}` });
    } catch (e) {
      toast.error(`분석 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const saveDraft = async () => {
    if (!draft) return;
    const id = `custom-${Date.now().toString(36)}`;
    const preset: Omit<CustomPreset, "created_at"> = { id, name: draft.name.trim() || "내 프리셋", base: draft.base, overrides: draft.overrides, source: "screenshot", note: draft.analysis.note };
    try {
      const file = await api.saveCustomPreset(preset);
      qc.setQueryData(qk.customPresets, file);
      const saved = file.presets.find((p) => p.id === id);
      if (saved) applyCustomPreset(slide.id, saved, withImage);
      setDraft(null);
      toast.success("스크린샷에서 레이아웃을 읽어 프리셋으로 등록했어요.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async (id: string) => {
    try {
      qc.setQueryData(qk.customPresets, await api.deleteCustomPreset(id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setWithImage((v) => !v)}
        className={cn("mb-2.5 flex w-full items-center justify-between gap-2 rounded-lg px-[11px] py-[7px] text-[11px] font-semibold", withImage ? "bg-brand text-white" : "bg-fill text-label-alt")}
      >
        <span>{withImage ? "이미지 보정까지 적용" : "레이아웃만 적용"}</span>
        <span className="opacity-70">밝기 · 대비 · 채도</span>
      </button>
      <div className="grid grid-cols-2 gap-2.5">
        {LAYOUT_PRESETS.map((p) => {
          const on = slide.style_preset === p.id && !slide.overrides;
          const dark = p.toneDefaults.background !== "#f5f2ea";
          return (
            <button key={p.id} type="button" title={p.description} onClick={() => applyPreset(slide.id, p.id as PresetId, withImage)} className="flex flex-col gap-1.5 text-left">
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-lg hairline-neutral" style={{ background: p.id === "info-dark" ? "#2E2F33" : dark ? "linear-gradient(160deg, #C9CBCF, #8E9298)" : "#F7F7F8" }}>
                <PresetBlocks placement={p.textPlacement} align={p.align} dark={dark} />
                {on && <div className="pointer-events-none absolute inset-0 rounded-lg" style={{ boxShadow: "inset 0 0 0 2px var(--semantic-primary-normal)" }} />}
              </div>
              <span className={cn("text-[11px] leading-[1.3]", on ? "font-semibold text-brand" : "text-label-alt")}>{p.name}</span>
            </button>
          );
        })}
        {presets.map((p) => {
          const on = activeCustom?.id === p.id;
          const dark = (p.overrides.toneDefaults?.background ?? "#0a0a0a") !== "#f5f2ea";
          return (
            <div key={p.id} className="group relative">
              <button type="button" title={p.note || p.name} onClick={() => applyCustomPreset(slide.id, p, withImage)} className="flex w-full flex-col gap-1.5 text-left">
                <div className="relative aspect-[4/5] w-full overflow-hidden rounded-lg hairline-neutral" style={{ background: dark ? "linear-gradient(160deg, #C9CBCF, #8E9298)" : "#F7F7F8" }}>
                  <PresetBlocks placement={p.overrides.textPlacement ?? "bottom-left"} align={p.overrides.align ?? "left"} dark={dark} />
                  {on && <div className="pointer-events-none absolute inset-0 rounded-lg" style={{ boxShadow: "inset 0 0 0 2px var(--semantic-primary-normal)" }} />}
                </div>
                <span className={cn("flex items-center gap-1 text-[11px] leading-[1.3]", on ? "font-semibold text-brand" : "text-label-alt")}>
                  <span className="size-[5px] shrink-0 rounded-full bg-brand" />
                  <span className="truncate">{p.name}</span>
                </span>
              </button>
              <button type="button" title="프리셋 삭제" onClick={() => remove(p.id)} className="absolute right-1 top-1 hidden size-6 place-items-center rounded-md bg-surface shadow-e-sm group-hover:grid">
                <Trash2 className="size-3 opacity-60" />
              </button>
            </div>
          );
        })}
      </div>
      <div className="mt-[18px] flex flex-col gap-2 rounded-xl px-2.5 pb-2.5 pt-3" style={{ boxShadow: "inset 0 1px 0 var(--semantic-line-solid-alternative)" }}>
        <PanelLabel>슬라이드 역할</PanelLabel>
        <div className="grid grid-cols-3 gap-1">
          {SlideRoleSchema.options.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => updateSlideRole(slide.id, r)}
              className={cn("rounded-lg px-2 py-1.5 text-[11px] font-semibold", slide.role === r ? "bg-fill text-label" : "bg-fill-alt text-label-alt hover:bg-fill")}
            >
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
        <span className="text-[11px] leading-normal text-label-assistive">역할을 바꾸면 채널 스타일팩이 정한 기본 프리셋이 적용돼요.</span>
      </div>
      <div className="mt-[18px] flex flex-col gap-2 rounded-xl px-2.5 pb-2.5 pt-3" style={{ boxShadow: "inset 0 1px 0 var(--semantic-line-solid-alternative)" }}>
        <PanelLabel>스크린샷으로 프리셋 만들기</PanelLabel>
        {draft ? (
          <div className="flex flex-col gap-2 rounded-[10px] bg-fill-alt p-2.5">
            <span className="text-[11px] font-semibold text-label-neutral">읽은 레이아웃 · {draft.provider === "cli" ? "로컬 Claude Code" : "Claude API"}</span>
            <span className="text-[11px] leading-normal text-label-alt">
              {draft.analysis.textPlacement} · {draft.analysis.align} · {Math.round(draft.analysis.fontSize)}px · {draft.analysis.lines}줄 · {draft.analysis.background === "dark" ? "어두운 배경" : "밝은 배경"}
            </span>
            {draft.analysis.note && <span className="text-[11px] leading-normal text-label-assistive">{draft.analysis.note}</span>}
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={cn(fieldClass, "py-2 text-xs")} placeholder="프리셋 이름" aria-label="프리셋 이름" />
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" onClick={() => setDraft(null)} className="h-[34px] rounded-lg text-[13px] font-semibold text-label-neutral hairline hover:bg-fill">취소</button>
              <button type="button" onClick={saveDraft} className="h-[34px] rounded-lg bg-brand text-[13px] font-semibold text-white hover:bg-brand-strong">등록하고 적용</button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => !analyzing && shotRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) void analyze(f); }}
              className={cn("grid h-[72px] w-full place-items-center rounded-[10px] border border-dashed text-[11px] text-label-assistive transition-colors", dragOver ? "border-brand bg-brand/5" : "border-line hover:bg-fill-alt")}
            >
              {analyzing ? <span className="flex items-center gap-1.5 text-label-neutral"><span className="size-3 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />레이아웃 읽는 중…</span> : "마음에 든 피드 스크린샷 드롭"}
            </button>
            <input ref={shotRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void analyze(f); e.target.value = ""; }} />
            <button type="button" disabled={analyzing} onClick={() => shotRef.current?.click()} className="h-[34px] rounded-lg text-[13px] font-semibold text-label-neutral hairline hover:bg-fill-alt disabled:opacity-50">
              {analyzing ? "읽는 중…" : "레이아웃 읽어 등록"}
            </button>
            <span className="text-[11px] leading-normal text-label-assistive">텍스트 위치·크기·정렬을 읽어 내 프리셋으로 저장하고 바로 적용해요. API 키가 없으면 이 PC 의 Claude Code(구독)로 읽어요.</span>
          </>
        )}
      </div>
    </>
  );
}

function PresetBlocks({ placement, align, dark }: { placement: string; align: string; dark: boolean }) {
  const top = placement.startsWith("top") ? 10 : placement === "center" ? 40 : placement === "lower-third" ? 58 : 66;
  const left = align === "center" ? 20 : 10;
  const w1 = align === "center" ? 60 : 66;
  const bg = dark ? "rgba(255,255,255,0.82)" : "rgba(23,23,25,0.45)";
  return (
    <>
      <div className="absolute rounded-[2px]" style={{ top: `${top}%`, left: `${left}%`, width: `${w1}%`, height: "9%", background: bg }} />
      <div className="absolute rounded-[2px]" style={{ top: `${top + 13}%`, left: `${align === "center" ? 30 : 10}%`, width: `${align === "center" ? 40 : 44}%`, height: "5%", background: bg }} />
    </>
  );
}

// ---------------- 요소 ----------------
const BASE_LAYER: Omit<SlideLayer, "id" | "kind" | "key"> = {
  asset: null, x: 540, y: 540, width: 300, rotation: 0, opacity: 1, flip: false, text: "", color: "#FFFFFF", bg: null, ink: null, fontFamily: "sans", hidden: false, locked: false,
};

function ElementsTab({ slide, bundle }: { slide: SlideDef; bundle: PostBundle }) {
  const addLayer = useEditorStore((s) => s.addLayer);
  const markSaved = useEditorStore((s) => s.markSaved);
  const channel = useEditorStore((s) => s.snapshot?.metadata.channel);
  const chColor = channel ? CHANNEL_META[channel].color : "#0066FF";

  const addSticker = (key: StickerKey) => {
    const d = stickerDef(key);
    addLayer(slide.id, { ...BASE_LAYER, kind: "sticker", key, width: d.width, text: d.text, color: d.useColor ? chColor : d.ink });
  };
  const addIcon = (key: string) => {
    addLayer(slide.id, { ...BASE_LAYER, kind: "icon", key, width: 150 });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <PanelLabel>스티커</PanelLabel>
        <div className="grid grid-cols-2 gap-2">
          {STICKERS.map((s) => (
            <button key={s.key} type="button" title={s.label} onClick={() => addSticker(s.key)} className="flex flex-col gap-1 text-left">
              <div className="grid h-[54px] place-items-center overflow-hidden rounded-[10px]" style={{ background: "linear-gradient(160deg, #6E7378, #3A3D42)" }}>
                <StickerPreview k={s.key} text={s.text} color={chColor} />
              </div>
              <span className="text-[10px] leading-tight text-label-alt">{s.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <PanelLabel>아이콘</PanelLabel>
        <div className="grid grid-cols-5 gap-1.5">
          {ICONS.map((i) => {
            const Icon = ICON_COMPONENTS[i.key];
            return (
              <button key={i.key} type="button" title={iconLabel(i.key)} onClick={() => addIcon(i.key)} className="grid aspect-square place-items-center rounded-lg bg-fill-alt hover:bg-fill">
                <Icon className="size-[18px] opacity-75" />
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <PanelLabel>밈 누끼</PanelLabel>
        <div className="flex flex-col gap-2 rounded-xl bg-fill-alt p-2.5">
          <button
            type="button"
            onClick={() => !cutting && fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) void cutUpload(f); }}
            className={cn("grid h-[92px] w-full place-items-center rounded-[10px] border border-dashed text-[11px] text-label-assistive transition-colors", dragOver ? "border-brand bg-brand/5" : "border-line hover:bg-fill")}
          >
            {cutting ? (
              <span className="flex flex-col items-center gap-1.5 px-2 text-label-neutral">
                <span className="font-semibold">{cutting.step} {Math.round(cutting.pct * 100)}%</span>
                <span className="h-1 w-32 overflow-hidden rounded-full bg-fill-strong"><span className="block h-full bg-brand transition-[width]" style={{ width: `${Math.round(cutting.pct * 100)}%` }} /></span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5"><Upload className="size-3.5" />이미지를 여기에 드롭</span>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void cutUpload(f); e.target.value = ""; }} />
          <button type="button" disabled={!!cutting} onClick={() => fileRef.current?.click()} className="flex h-[34px] items-center justify-center gap-1.5 rounded-lg bg-brand text-[13px] font-semibold text-white hover:bg-brand-strong disabled:opacity-50">
            <Scissors className="size-3.5" />{cutting ? "배경 지우는 중…" : "배경 지워서 라이브러리에 담기"}
          </button>
          <span className="text-[11px] leading-normal text-label-assistive">브라우저 안에서 배경을 지워요(외부 서비스·키 없음). 처음 한 번은 모델(약 40MB)을 내려받아요.</span>
        </div>
      </div>
    </div>
  );
}

function StickerPreview({ k, text, color }: { k: StickerKey; text: string; color: string }) {
  const base = "flex max-w-[86%] items-center justify-center overflow-hidden whitespace-nowrap text-[10px] font-semibold";
  switch (k) {
    case "tape":
      return <span className={cn(base, "min-w-[74%] px-1 py-[3px] text-[#171719] shadow-md")} style={{ background: "rgba(255,255,255,0.86)" }}>{text}</span>;
    case "badge":
      return <span className={cn(base, "size-6 rounded-full font-bold tracking-wider text-white")} style={{ background: color, fontSize: 7 }}>{text}</span>;
    case "pill":
      return <span className={cn(base, "rounded-full bg-white px-2 py-1 text-[#171719]")}>{text}</span>;
    case "quote":
      return <span className="text-[22px] font-bold leading-[0.8] text-white">{text}</span>;
    case "arrow":
      return <span className="text-base font-semibold text-white">{text}</span>;
    case "highlight":
      return <span className={cn(base, "px-1 font-bold text-white")} style={{ background: color }}>{text}</span>;
    case "date":
      return <span className={cn(base, "border-y px-1 py-0.5 tracking-widest text-white")} style={{ borderColor: "rgba(255,255,255,0.65)" }}>{text}</span>;
    case "frame":
      return <span className="h-[30px] w-6 rounded-[3px] border-2 border-dashed" style={{ borderColor: "rgba(255,255,255,0.7)" }} />;
  }
}

// ---------------- 레이어 ----------------
function LayersTab({ slide, state }: { slide: SlideDef; state: SlideEditorState }) {
  const selection = useEditorStore((s) => s.selection);
  const setSelection = useEditorStore((s) => s.setSelection);
  const updateLayer = useEditorStore((s) => s.updateLayer);
  const removeLayer = useEditorStore((s) => s.removeLayer);
  const updateSlideState = useEditorStore((s) => s.updateSlideState);
  const layers = state.layers.slice().reverse();

  return (
    <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs font-semibold text-label-alt">누끼 라이브러리</span>
          <span className="text-[11px] text-label-assistive">{cutouts.length}개</span>
        </div>
        {cutouts.length === 0 ? (
          <span className="text-[11px] text-label-assistive">아직 없어요. 위에 이미지를 올리면 여기 쌓여요.</span>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {cutouts.map((a) => {
              const url = driveFileUrl(a.fileId);
              return (
                <button key={a.fileId} type="button" title={a.name} onClick={() => addCutout(a.name, url)} className="flex flex-col gap-1 text-left">
                  <div className="relative aspect-square overflow-hidden rounded-[10px] hairline-neutral" style={{ backgroundImage: "linear-gradient(45deg, #E8E9EB 25%, transparent 25%), linear-gradient(-45deg, #E8E9EB 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #E8E9EB 75%), linear-gradient(-45deg, transparent 75%, #E8E9EB 75%)", backgroundSize: "12px 12px", backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="size-full object-contain" />
                  </div>
                  <span className="truncate text-[11px] font-semibold">{a.name.replace(/\.png$/, "")}</span>
                </button>
              );
            })}
          </div>
        )}
        <span className="text-[11px] leading-normal text-label-assistive">라이브러리 항목을 누르면 현재 슬라이드에 다시 얹혀요. 캔버스에서 끌어 옮기고 크기·회전은 선택 프레임으로 조정해요.</span>
      {layers.map((l) => {
        const on = selection?.kind === "layer" && selection.id === l.id;
        const name = l.kind === "cutout" ? `누끼 · ${(l.asset ?? "").replace(/\.png$/, "")}` : l.kind === "icon" ? `아이콘 · ${iconLabel(l.key)}` : `${stickerDef(l.key).label}${l.text ? ` · ${l.text}` : ""}`;
        return (
          <div key={l.id} role="button" tabIndex={0} onClick={() => setSelection({ kind: "layer", id: l.id })} onKeyDown={(e) => e.key === "Enter" && setSelection({ kind: "layer", id: l.id })} className={cn("flex cursor-pointer items-center gap-1.5 rounded-[10px] px-2 py-[7px] hover:bg-fill-alt", on && "bg-fill")}>
            <button type="button" title="표시" onClick={(e) => { e.stopPropagation(); updateLayer(slide.id, l.id, { hidden: !l.hidden }); }} className="grid size-6 place-items-center rounded-md">
              {l.hidden ? <EyeOff className="size-[15px] opacity-30" /> : <Eye className="size-[15px] opacity-70" />}
            </button>
            <span className="min-w-0 flex-1 truncate text-xs font-medium">{name}</span>
            <button type="button" title="잠금" onClick={(e) => { e.stopPropagation(); updateLayer(slide.id, l.id, { locked: !l.locked }); }} className={cn("rounded-md px-1.5 py-[3px] text-[10px] font-semibold", l.locked ? "text-brand" : "text-label-assistive")}>
              {l.locked ? "잠김" : "잠금"}
            </button>
            <button type="button" title="삭제" onClick={(e) => { e.stopPropagation(); removeLayer(slide.id, l.id); }} className="grid size-[22px] place-items-center rounded-md hover:bg-fill">
              <Trash2 className="size-3.5 opacity-45" />
            </button>
          </div>
        );
      })}
      <div role="button" tabIndex={0} onClick={() => setSelection({ kind: "text" })} onKeyDown={(e) => e.key === "Enter" && setSelection({ kind: "text" })} className={cn("flex cursor-pointer items-center gap-1.5 rounded-[10px] px-2 py-[7px] hover:bg-fill-alt", selection?.kind === "text" && "bg-fill")}>
        <span className="grid size-6 place-items-center"><Type className="size-[15px] opacity-70" /></span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium">텍스트 · {slide.text.split("\n")[0] || "(비어 있음)"}</span>
        <button type="button" title="잠금" onClick={(e) => { e.stopPropagation(); updateSlideState(slide.id, (s) => { s.text.locked = !s.text.locked; }); }} className={cn("rounded-md px-1.5 py-[3px] text-[10px] font-semibold", state.text.locked ? "text-brand" : "text-label-assistive")}>
          {state.text.locked ? "잠김" : "잠금"}
        </button>
      </div>
      <div role="button" tabIndex={0} onClick={() => setSelection({ kind: "image" })} onKeyDown={(e) => e.key === "Enter" && setSelection({ kind: "image" })} className={cn("flex cursor-pointer items-center gap-1.5 rounded-[10px] px-2 py-[7px] hover:bg-fill-alt", selection?.kind === "image" && "bg-fill")}>
        <span className="grid size-6 place-items-center"><span className="size-3.5 rounded-[3px] bg-label-alt opacity-70" /></span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium">배경 이미지 · {slide.asset ?? "없음"}</span>
      </div>
      <span className="px-1 pt-2 text-[11px] leading-relaxed text-label-assistive">단축키 — ⌘Z 되돌리기 · ⇧⌘Z 다시하기 · ⌘D 복제 · Delete 삭제 · 방향키 이동 · Esc 선택 해제</span>
    </div>
  );
}
