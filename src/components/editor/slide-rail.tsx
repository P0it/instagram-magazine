"use client";

import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from "lucide-react";
import type { PostBundle, SlideRole } from "@/types";
import { useEditorStore } from "@/stores/editor-store";
import { driveFileUrl } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { SlideCanvas } from "./canvas";

const ROLE_LABEL: Record<SlideRole, string> = { cover: "커버", photo: "사진", info: "정보", quote: "인용", screenshot: "스크린샷", closing: "클로징" };
const THUMB_W = 96;

/**
 * 스테이지 왼쪽 세로 슬라이드 레일: 선택 · 순서 변경 · 추가 · 복제 · 삭제.
 * 가로 136px 만 쓰고 세로는 스크롤 — 캔버스가 스테이지 높이를 전부 쓸 수 있게 한다.
 */
export function SlideRail({ bundle, disabled }: { bundle: PostBundle; disabled: boolean }) {
  const snap = useEditorStore((s) => s.snapshot);
  const selectedId = useEditorStore((s) => s.selectedSlideId);
  const select = useEditorStore((s) => s.select);
  const addSlide = useEditorStore((s) => s.addSlide);
  const removeSlide = useEditorStore((s) => s.removeSlide);
  const moveSlide = useEditorStore((s) => s.moveSlide);
  const duplicateSlide = useEditorStore((s) => s.duplicateSlide);
  if (!snap) return null;
  const slides = snap.metadata.slides;
  const H = snap.editorState.canvas.height;
  const thumbH = Math.round((THUMB_W * H) / 1080);
  const assetUrl = (name: string | null | undefined) => {
    if (!name) return null;
    const a = bundle.assets.find((x) => x.name === name);
    return a ? driveFileUrl(a.fileId) : null;
  };

  return (
    <aside
      className={cn("flex w-[136px] shrink-0 flex-col bg-surface", disabled && "pointer-events-none opacity-45")}
      style={{ boxShadow: "inset -1px 0 0 var(--semantic-line-solid-neutral)" }}
      aria-label="슬라이드"
    >
      <div className="flex shrink-0 items-baseline gap-1.5 px-5 pb-2 pt-3.5">
        <span className="text-[13px] font-semibold text-label-neutral">슬라이드</span>
        <span className="text-[11px] text-label-assistive">{slides.length}장</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto overflow-x-hidden px-5 pb-4 pt-1">
        {slides.map((s, i) => {
          const st = snap.editorState.slides[s.id];
          const active = s.id === selectedId;
          return (
            <div key={s.id} className="group relative shrink-0" style={{ width: THUMB_W }}>
              <button
                type="button"
                onClick={() => select(s.id)}
                data-testid="slide-thumb"
                title={`${i + 1}. ${ROLE_LABEL[s.role]} · ${s.text.split("\n")[0] || "빈 슬라이드"}`}
                className="flex w-full flex-col gap-1.5 text-left"
              >
                <div className="relative w-full overflow-hidden rounded-lg bg-fill hairline-neutral" style={{ height: thumbH }}>
                  {st && <SlideCanvas slideState={st} text={s.text} imageUrl={assetUrl(s.asset)} displayWidth={THUMB_W} canvasHeight={H} resolveAsset={assetUrl} />}
                  <span className="absolute left-1.5 top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-[6px] px-1 text-[11px] font-semibold text-white backdrop-blur-[32px]" style={{ background: "rgba(23,23,25,0.58)" }}>{i + 1}</span>
                  {active && <div className="pointer-events-none absolute inset-0 rounded-lg" style={{ boxShadow: "inset 0 0 0 2px var(--semantic-primary-normal)" }} />}
                </div>
                <span className={cn("max-w-full truncate text-[11px] leading-[1.3]", active ? "font-semibold text-label" : "font-medium text-label-alt")}>{ROLE_LABEL[s.role]} · {s.text.split("\n")[0] || "빈 슬라이드"}</span>
              </button>
              {active && (
                <div className="absolute right-1.5 top-1.5 hidden flex-col gap-1 group-hover:flex">
                  <IconBtn title="위로" onClick={() => moveSlide(i, i - 1)} disabled={i === 0}><ChevronUp className="size-3.5" /></IconBtn>
                  <IconBtn title="아래로" onClick={() => moveSlide(i, i + 1)} disabled={i === slides.length - 1}><ChevronDown className="size-3.5" /></IconBtn>
                  <IconBtn title="복제" onClick={() => duplicateSlide(s.id)}><Copy className="size-3.5" /></IconBtn>
                  <IconBtn title="삭제" onClick={() => removeSlide(s.id)} disabled={slides.length <= 1} danger><Trash2 className="size-3.5" /></IconBtn>
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
          style={{ width: THUMB_W, height: 56 }}
        >
          <Plus className="size-[18px] opacity-50" />
        </button>
      </div>
    </aside>
  );
}

function IconBtn({ children, onClick, title, disabled, danger }: { children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn("flex size-6 items-center justify-center rounded-md bg-surface text-label shadow-e-sm hairline-neutral disabled:opacity-30", danger && "hover:bg-negative hover:text-white")}
    >
      {children}
    </button>
  );
}
