"use client";

import { useState } from "react";
import { Bookmark, ChevronLeft, ChevronRight, Heart, MessageCircle, Send } from "lucide-react";
import type { PostBundle } from "@/types";
import type { EditorSnapshot } from "@/stores/editor-store";
import { fullCaption } from "@/lib/metadata/approval-gate";
import { SlideCanvas } from "@/components/editor/canvas";
import { cn } from "@/lib/utils";

/** Instagram 피드 모양 미리보기 — 현재 편집 상태를 그대로 렌더 */
export function FeedPreview({
  bundle,
  snapshot,
  assetUrl,
  username = "magazine",
}: {
  bundle: PostBundle;
  snapshot: EditorSnapshot;
  assetUrl: (name: string | null | undefined) => string | null;
  username?: string;
}) {
  const [i, setI] = useState(0);
  const slides = snapshot.metadata.slides;
  const slide = slides[Math.min(i, slides.length - 1)];
  const st = slide ? snapshot.editorState.slides[slide.id] : null;
  const width = 400;
  void bundle;

  return (
    <div className="w-[400px] overflow-hidden rounded-xl border border-border bg-background shadow-xl">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="size-8 rounded-full bg-gradient-to-tr from-amber-400 via-rose-500 to-violet-600 p-[2px]">
          <div className="size-full rounded-full bg-background" />
        </div>
        <span className="text-sm font-semibold">{username}</span>
        <span className="ml-auto text-muted-foreground">···</span>
      </div>
      <div className="relative bg-black" style={{ width, height: width * 1.25 }}>
        {slide && st && <SlideCanvas slideState={st} text={slide.text} imageUrl={assetUrl(slide.asset)} displayWidth={width} />}
        {slides.length > 1 && (
          <>
            <button type="button" onClick={() => setI((v) => Math.max(0, v - 1))} className={cn("absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1 text-black shadow", i === 0 && "opacity-0")}>
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" onClick={() => setI((v) => Math.min(slides.length - 1, v + 1))} className={cn("absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1 text-black shadow", i === slides.length - 1 && "opacity-0")}>
              <ChevronRight className="size-4" />
            </button>
            <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">{i + 1}/{slides.length}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <Heart className="size-5" />
        <MessageCircle className="size-5" />
        <Send className="size-5" />
        {slides.length > 1 && (
          <div className="mx-auto flex gap-1">
            {slides.map((s, k) => <span key={s.id} className={cn("size-1.5 rounded-full", k === i ? "bg-sky-500" : "bg-muted-foreground/40")} />)}
          </div>
        )}
        <Bookmark className="ml-auto size-5" />
      </div>
      <div className="max-h-40 overflow-y-auto px-3 pb-3 text-sm">
        <span className="font-semibold">{username}</span>{" "}
        <span className="whitespace-pre-line text-foreground/90">{fullCaption(snapshot.metadata)}</span>
      </div>
    </div>
  );
}
