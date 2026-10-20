"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { REFERENCE_KIND_LABEL, type Reference } from "@/types";
import { driveFileUrl } from "@/lib/client/api";
import { stepSlide } from "@/lib/client/slide-index";
import { cn } from "@/lib/utils";

const isTyping = (el: Element | null) => {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
};

/**
 * 레퍼런스 카드 — 모두 4:5 썸네일 + 고정 높이 하단 바.
 * 여러 장이면 카드 위에서 바로 넘겨 볼 수 있다 (호버 시 ‹ ›, 호버 중 ← →). 카드를 누르면 상세가 열린다.
 */
export function ReferenceCard({ reference: r, onOpen }: { reference: Reference; onOpen: () => void }) {
  const n = r.images.length;
  const [idx, setIdx] = useState(0);
  const [hover, setHover] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const cur = stepSlide(idx, 0, n);

  useEffect(() => {
    if (!hover || n <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(document.activeElement)) return;
      if (e.key === "ArrowRight") { setIdx((i) => stepSlide(i, 1, n)); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { setIdx((i) => stepSlide(i, -1, n)); e.preventDefault(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hover, n]);

  const flip = (d: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setIdx((i) => stepSlide(i, d, n));
  };

  return (
    <div
      ref={rootRef}
      data-testid="reference-card"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="group overflow-hidden rounded-xl bg-surface"
    >
      <div role="button" tabIndex={0} aria-label={`${r.title} 열기`} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) onOpen(); }} className="relative block aspect-[4/5] w-full cursor-pointer overflow-hidden bg-fill-alt">
        {n > 0 ? (
          <div className="flex h-full transition-transform duration-200 ease-out" style={{ transform: `translateX(-${cur * 100}%)` }}>
            {r.images.map((im, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={im.fileId} src={driveFileUrl(im.fileId)} alt={i === 0 ? r.title : ""} loading="lazy" draggable={false} className="size-full shrink-0 object-cover" />
            ))}
          </div>
        ) : (
          <div className="grid size-full place-items-center text-xs text-label-assistive">이미지 없음</div>
        )}
        <span className="absolute left-2.5 top-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">{REFERENCE_KIND_LABEL[r.kind]}</span>
        {n > 1 && (
          <>
            <span data-testid="slide-count" className="absolute right-2.5 top-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">{cur + 1}/{n}</span>
            {cur > 0 && (
              <button type="button" aria-label="이전 슬라이드" onClick={flip(-1)} className="absolute left-2 top-1/2 hidden size-[30px] -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black group-hover:grid"><ChevronLeft className="size-4" /></button>
            )}
            {cur < n - 1 && (
              <button type="button" aria-label="다음 슬라이드" onClick={flip(1)} className="absolute right-2 top-1/2 hidden size-[30px] -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black group-hover:grid"><ChevronRight className="size-4" /></button>
            )}
            <span className="pointer-events-none absolute inset-x-0 bottom-2.5 flex justify-center gap-1">
              {r.images.map((im, i) => <i key={im.fileId} className={cn("size-1.5 rounded-full", i === cur ? "bg-brand" : "bg-white/40")} />)}
            </span>
          </>
        )}
      </div>
      <div className="flex h-[52px] flex-col justify-center gap-0.5 px-3">
        <span className="truncate text-[13px] font-semibold">{r.title}</span>
        <span className="truncate text-[11px] text-label-alt">{r.account ? `@${r.account}` : REFERENCE_KIND_LABEL[r.kind]}</span>
      </div>
    </div>
  );
}
