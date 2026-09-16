"use client";

import { useState } from "react";
import { Eye, EyeOff, Trash2, Type } from "lucide-react";
import { LAYOUT_PRESETS } from "@/presets";
import { SlideRoleSchema, type PresetId, type SlideDef, type SlideEditorState, type SlideRole, type StickerKey } from "@/types";
import { useEditorStore } from "@/stores/editor-store";
import { ICONS, STICKERS, iconLabel, stickerDef } from "@/lib/render/stickers";
import { ICON_COMPONENTS } from "@/lib/render/icon-svg";
import { CHANNEL_META } from "@/lib/client/channel";
import { Segmented } from "@/components/md/segmented";
import { PanelLabel } from "@/components/md/primitives";
import { cn } from "@/lib/utils";

export type LeftTab = "presets" | "elements" | "layers";

const ROLE_LABEL: Record<SlideRole, string> = { cover: "커버", photo: "사진", info: "정보", quote: "인용", screenshot: "스크린샷", closing: "클로징" };

const HINT: Record<LeftTab, string> = {
  presets: "프리셋을 고르거나, 역할을 바꿔 채널 스타일팩 기본값을 적용하세요.",
  elements: "눌러서 캔버스에 얹고, 끌어서 옮기세요. 방향키로 4px씩 이동.",
  layers: "이 슬라이드의 레이어 순서와 표시를 관리해요.",
};

export function LeftPanel({ tab, onTab, slide, state, disabled }: { tab: LeftTab; onTab: (t: LeftTab) => void; slide: SlideDef | null; state: SlideEditorState | null; disabled: boolean }) {
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
          <ElementsTab slide={slide} />
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
  const updateSlideRole = useEditorStore((s) => s.updateSlideRole);
  const [withImage, setWithImage] = useState(true);
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
          const on = slide.style_preset === p.id;
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
        <div className="grid h-[72px] place-items-center rounded-[10px] border border-dashed border-line text-[11px] text-label-assistive">준비 중</div>
        <span className="text-[11px] leading-normal text-label-assistive">마음에 든 피드 스크린샷에서 텍스트 위치·크기·정렬을 읽어 내 프리셋으로 저장하는 기능은 다음 단계에서 붙어요.</span>
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
function ElementsTab({ slide }: { slide: SlideDef }) {
  const addLayer = useEditorStore((s) => s.addLayer);
  const channel = useEditorStore((s) => s.snapshot?.metadata.channel);
  const chColor = channel ? CHANNEL_META[channel].color : "#0066FF";

  const addSticker = (key: StickerKey) => {
    const d = stickerDef(key);
    addLayer(slide.id, {
      kind: "sticker",
      key,
      x: 540,
      y: 540,
      width: d.width,
      rotation: 0,
      opacity: 1,
      flip: false,
      text: d.text,
      color: d.useColor ? chColor : d.ink,
      bg: null,
      ink: null,
      fontFamily: "sans",
      hidden: false,
      locked: false,
    });
  };
  const addIcon = (key: string) => {
    addLayer(slide.id, { kind: "icon", key, x: 540, y: 540, width: 150, rotation: 0, opacity: 1, flip: false, text: "", color: "#FFFFFF", bg: null, ink: null, fontFamily: "sans", hidden: false, locked: false });
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
          <div className="grid h-[92px] place-items-center rounded-[10px] border border-dashed border-line text-[11px] text-label-assistive">준비 중</div>
          <span className="text-[11px] leading-normal text-label-assistive">배경을 지워 스티커로 만드는 기능은 배경 제거 서비스 연결 뒤에 열려요.</span>
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
      {layers.map((l) => {
        const on = selection?.kind === "layer" && selection.id === l.id;
        const name = l.kind === "icon" ? `아이콘 · ${iconLabel(l.key)}` : `${stickerDef(l.key).label}${l.text ? ` · ${l.text}` : ""}`;
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
