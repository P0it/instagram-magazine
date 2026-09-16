"use client";

import { ChevronLeft, ChevronRight, Copy, Plus, Trash2 } from "lucide-react";
import type { PostBundle, SlideRole } from "@/types";
import { useEditorStore } from "@/stores/editor-store";
import { driveFileUrl } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { SlideCanvas } from "./canvas";

const ROLE_LABEL: Record<SlideRole, string> = { cover: "커버", photo: "사진", info: "정보", quote: "인용", screenshot: "스크린샷", closing: "클로징" };
const THUMB_W = 68;
const THUMB_H = 85;

/** 하단 슬라이드 스트립 (목업 S-02): 선택 · 순서 변경 · 추가 · 복제 · 삭제 */
export function SlideStrip({ bundle, disabled }: { bundle: PostBundle; disabled: boolean }) {
  const snap = useEditorStore((s) => s.snapshot);
  const selectedId = useEditorStore((s) => s.selectedSlideId);
  const select = useEditorStore((s) => s.select);
  const addSlide = useEditorStore((s) => s.addSlide);
  const removeSlide = useEditorStore((s) => s.removeSlide);
  const moveSlide = useEditorStore((s) => s.moveSlide);
  const duplicateSlide = useEditorStore((s) => s.duplicateSlide);
  if (!snap) return null;
  const slides = snap.metadata.slides;
  const idx = slides.findIndex((s) => s.id === selectedId);
  const assetUrl = (name: string | null | undefined) => {
    if (!name) return null;
    const a = bundle.assets.find((x) => x.name === name);
    return a ? driveFileUrl(a.fileId) : null;
  };

  return (
    <div className={cn("relative flex shrink-0 items-center bg-surface px-4 py-2.5", disabled && "pointer-events-none opacity-45")} style={{ boxShadow: "inset 0 1px 0 var(--semantic-line-solid-neutral)" }}>
      <div className="absolute left-4 top-3.5 flex items-baseline gap-1.5">
        <span className="text-[13px] font-semibold text-label-neutral">슬라이드</span>
        <span className="text-[11px] text-label-assistive">{slides.length}장</span>
      </div>
      <div className="flex min-w-0 flex-1 items-start justify-center gap-2.5 overflow-x-auto px-[108px] pb-1 pt-0.5">
        {slides.map((s, i) => {
          const st = snap.editorState.slides[s.id];
          const active = s.id === selectedId;
          return (
            <div key={s.id} className="group relative w-[68px] shrink-0">
              <button
                type="button"
                onClick={() => select(s.id)}
                data-testid="slide-thumb"
                title={`${i + 1}. ${ROLE_LABEL[s.role]}`}
                className="flex w-full flex-col gap-[5px] text-left"
              >
                <div className="relative overflow-hidden rounded-lg bg-fill hairline-neutral" style={{ width: THUMB_W, height: THUMB_H }}>
                  {st && <SlideCanvas slideState={st} text={s.text} imageUrl={assetUrl(s.asset)} displayWidth={THUMB_W} />}
                  <span className="absolute left-1 top-1 grid h-4 min-w-4 place-items-center rounded-[5px] px-1 text-[10px] font-semibold text-white backdrop-blur-[32px]" style={{ background: "rgba(23,23,25,0.58)" }}>{i + 1}</span>
                  {active && <div className="pointer-events-none absolute inset-0 rounded-lg" style={{ boxShadow: "inset 0 0 0 2px var(--semantic-primary-normal)" }} />}
                </div>
                <span className={cn("max-w-full truncate text-[11px] leading-[1.3]", active ? "font-semibold text-label" : "font-medium text-label-alt")}>{ROLE_LABEL[s.role]} · {s.text.split("\n")[0] || "빈 슬라이드"}</span>
              </button>
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
          disabled={slides.length >= 10}
          title={slides.length >= 10 ? "최대 10장" : "슬라이드 추가"}
          className="grid shrink-0 place-items-center rounded-lg bg-fill-alt hover:bg-fill disabled:opacity-40"
          style={{ width: THUMB_W, height: THUMB_H }}
        >
          <Plus className="size-[18px] opacity-50" />
        </button>
      </div>
      <span className="absolute right-4 top-3.5 whitespace-nowrap text-[11px] text-label-assistive">{idx + 1} / {slides.length}</span>
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
      className={cn("flex size-5 items-center justify-center rounded-md bg-surface text-label shadow-e-sm hairline-neutral disabled:opacity-30", danger && "hover:bg-negative hover:text-white")}
    >
      {children}
    </button>
  );
}
