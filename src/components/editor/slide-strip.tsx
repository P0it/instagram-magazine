"use client";

import { ChevronLeft, ChevronRight, Copy, Plus, Trash2 } from "lucide-react";
import type { PostBundle } from "@/types";
import { useEditorStore } from "@/stores/editor-store";
import { driveFileUrl } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { SlideCanvas } from "./canvas";

/** 하단 캐러셀 스트립: 선택 · 순서 변경 · 추가 · 복제 · 삭제 */
export function SlideStrip({ bundle }: { bundle: PostBundle }) {
  const snap = useEditorStore((s) => s.snapshot);
  const selectedId = useEditorStore((s) => s.selectedSlideId);
  const select = useEditorStore((s) => s.select);
  const addSlide = useEditorStore((s) => s.addSlide);
  const removeSlide = useEditorStore((s) => s.removeSlide);
  const moveSlide = useEditorStore((s) => s.moveSlide);
  const duplicateSlide = useEditorStore((s) => s.duplicateSlide);
  if (!snap) return null;
  const slides = snap.metadata.slides;
  const assetUrl = (name: string | null | undefined) => {
    if (!name) return null;
    const a = bundle.assets.find((x) => x.name === name);
    return a ? driveFileUrl(a.fileId) : null;
  };

  return (
    <div className="flex h-36 shrink-0 items-center gap-2 overflow-x-auto border-t border-border bg-muted/30 px-4">
      {slides.map((s, i) => {
        const st = snap.editorState.slides[s.id];
        const active = s.id === selectedId;
        return (
          <div key={s.id} className="group relative shrink-0">
            <button
              type="button"
              onClick={() => select(s.id)}
              data-testid="slide-thumb"
              className={cn("block overflow-hidden rounded-md border-2 transition-colors", active ? "border-foreground" : "border-transparent hover:border-border")}
              style={{ width: 88, height: 110 }}
            >
              {st ? (
                <SlideCanvas slideState={st} text={s.text} imageUrl={assetUrl(s.asset)} displayWidth={88} />
              ) : (
                <div className="size-full bg-muted" />
              )}
            </button>
            <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] font-semibold text-white">{i + 1}</span>
            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] uppercase text-white/80">{s.role}</span>
            {active && (
              <div className="absolute -right-1 -top-1 hidden flex-col gap-0.5 group-hover:flex">
                <IconBtn title="왼쪽으로" onClick={() => moveSlide(i, i - 1)} disabled={i === 0}><ChevronLeft className="size-3" /></IconBtn>
                <IconBtn title="오른쪽으로" onClick={() => moveSlide(i, i + 1)} disabled={i === slides.length - 1}><ChevronRight className="size-3" /></IconBtn>
                <IconBtn title="복제" onClick={() => duplicateSlide(s.id)}><Copy className="size-3" /></IconBtn>
                <IconBtn title="삭제" onClick={() => removeSlide(s.id)} disabled={slides.length <= 1} danger><Trash2 className="size-3" /></IconBtn>
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => addSlide(slides.length === 0 ? "cover" : "info")}
        className="flex shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground hover:text-foreground"
        style={{ width: 88, height: 110 }}
        disabled={slides.length >= 10}
        title={slides.length >= 10 ? "최대 10장" : "슬라이드 추가"}
      >
        <Plus className="size-4" />
        <span className="text-[10px]">{slides.length}/10</span>
      </button>
    </div>
  );
}

function IconBtn({ children, onClick, title, disabled, danger }: { children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn("flex size-5 items-center justify-center rounded bg-background text-foreground shadow ring-1 ring-border disabled:opacity-30", danger && "hover:bg-red-500 hover:text-white")}
    >
      {children}
    </button>
  );
}
