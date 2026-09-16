"use client";

import { useState } from "react";
import { Bookmark, ChevronLeft, ChevronRight, Heart, MoreVertical, Send } from "lucide-react";
import type { PostBundle } from "@/types";
import type { EditorSnapshot } from "@/stores/editor-store";
import { usePosts, useSystemStatus } from "@/lib/client/queries";
import { driveFileUrl } from "@/lib/client/api";
import { CHANNEL_META, channelGround } from "@/lib/client/channel";
import { Segmented } from "@/components/md/segmented";
import { SlideCanvas } from "./canvas";
import { cn } from "@/lib/utils";

const W = 400;

/** 목업 S-03 미리보기: 폰 프레임 안 피드 / 프로필 그리드, 라이트·다크 */
export function PreviewMode({ bundle, snapshot, assetUrl, onBack }: { bundle: PostBundle; snapshot: EditorSnapshot; assetUrl: (n: string | null | undefined) => string | null; onBack: () => void }) {
  const [mode, setMode] = useState<"feed" | "grid">("feed");
  const [dark, setDark] = useState(false);
  const [i, setI] = useState(0);
  const status = useSystemStatus();
  const m = snapshot.metadata;
  const meta = CHANNEL_META[m.channel];
  const account = status.data?.accounts.find((a) => a.key === status.data?.channels.find((c) => c.key === m.channel)?.instagram_account_key);
  const handle = account?.username ?? meta.handle;
  const slides = m.slides;
  const slide = slides[Math.min(i, slides.length - 1)];
  const st = slide ? snapshot.editorState.slides[slide.id] : null;
  const ink = dark ? "rgba(255,255,255,0.92)" : "var(--semantic-label-normal)";
  const inkSoft = dark ? "rgba(255,255,255,0.5)" : "var(--semantic-label-alternative)";
  void bundle;

  return (
    <section className="flex min-h-0 flex-1 flex-col items-center gap-3.5 overflow-auto px-6 pb-4 pt-4">
      <div className="flex items-center gap-3">
        <div className="w-[220px]">
          <Segmented value={mode} onChange={setMode} items={[{ value: "feed", label: "피드" }, { value: "grid", label: "프로필 그리드" }]} />
        </div>
        <button type="button" onClick={() => setDark((v) => !v)} className="rounded-full bg-fill-alt px-3 py-1.5 text-[13px] text-label-neutral hover:bg-fill">
          {dark ? "다크 테마" : "라이트 테마"}
        </button>
      </div>

      {mode === "feed" ? (
        <div className="relative shrink-0 rounded-[48px] p-3 shadow-e-lg" style={{ background: "#1B1C1E" }}>
          <div className="flex flex-col overflow-hidden rounded-[38px]" style={{ width: W, background: dark ? "#000" : "#fff" }}>
            <div className="flex items-center gap-2.5 px-3.5 pb-2.5 pt-4">
              <div className="size-8 shrink-0 rounded-full p-0.5" style={{ background: `linear-gradient(135deg, ${meta.color}, var(--semantic-accent-background-pink))` }}>
                <div className="size-full rounded-full" style={{ background: meta.color }} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[13px] font-semibold" style={{ color: ink }}>{handle}</span>
                <span className="text-[11px]" style={{ color: inkSoft }}>서울 · {meta.title}</span>
              </div>
              <MoreVertical className="size-[18px] opacity-50" style={{ color: ink }} />
            </div>
            <div className="relative bg-black" style={{ width: W, height: W * 1.25 }}>
              {slide && st && <SlideCanvas slideState={st} text={slide.text} imageUrl={assetUrl(slide.asset)} displayWidth={W} />}
              {slides.length > 1 && (
                <>
                  <button type="button" onClick={() => setI((v) => Math.max(0, v - 1))} className={cn("absolute inset-y-0 left-0 z-[4] flex w-[13%] items-center justify-start pl-2.5 opacity-0 transition-opacity hover:opacity-100", i === 0 && "hover:opacity-35")} style={{ background: "linear-gradient(90deg, rgba(23,23,25,0.5), rgba(23,23,25,0))" }}>
                    <ChevronLeft className="size-[22px] text-white" />
                  </button>
                  <button type="button" onClick={() => setI((v) => Math.min(slides.length - 1, v + 1))} className={cn("absolute inset-y-0 right-0 z-[4] flex w-[13%] items-center justify-end pr-2.5 opacity-0 transition-opacity hover:opacity-100", i === slides.length - 1 && "hover:opacity-35")} style={{ background: "linear-gradient(270deg, rgba(23,23,25,0.5), rgba(23,23,25,0))" }}>
                    <ChevronRight className="size-[22px] text-white" />
                  </button>
                  <span className="pointer-events-none absolute right-2.5 top-2.5 rounded-full px-[9px] py-1 text-[11px] font-semibold text-white backdrop-blur-[32px]" style={{ background: "rgba(23,23,25,0.52)" }}>{i + 1} / {slides.length}</span>
                </>
              )}
            </div>
            {slides.length > 1 && (
              <div className="flex items-center justify-center gap-[5px] pb-1.5 pt-2.5">
                {slides.map((s, k) => <span key={s.id} className="size-[5px] rounded-full" style={{ background: k === i ? (dark ? "#fff" : "var(--semantic-primary-normal)") : "var(--semantic-label-assistive)" }} />)}
              </div>
            )}
            <div className="flex items-center gap-3.5 px-3.5 pb-1.5 pt-1" style={{ color: ink }}>
              <Heart className="size-[22px]" />
              <Send className="size-[22px]" />
              <div className="flex-1" />
              <Bookmark className="size-[22px]" />
            </div>
            <div className="flex flex-col gap-1 px-3.5 pb-[18px] pt-1">
              <span className="text-[13px] font-semibold" style={{ color: ink }}>좋아요 1,284개</span>
              <p className="m-0 line-clamp-3 whitespace-pre-line text-[13px] leading-[1.55]" style={{ color: ink }}>
                <span className="font-semibold">{handle}</span> {m.caption}
              </p>
              <span className="text-[13px]" style={{ color: inkSoft }}>더 보기</span>
              <p className="m-0 mt-0.5 text-[13px] leading-normal text-brand">{m.hashtags.map((h) => `#${h}`).join(" ")}</p>
            </div>
          </div>
        </div>
      ) : (
        <ProfileGrid channel={m.channel} highlight={m.post_id} currentThumb={slide && st ? { st, text: slide.text, img: assetUrl(slide.asset) } : null} />
      )}

      <div className="self-end">
        <button type="button" onClick={onBack} className="h-10 w-[150px] rounded-[10px] text-sm font-semibold text-label-neutral hairline hover:bg-fill-alt">편집으로 돌아가기</button>
      </div>
    </section>
  );
}

function ProfileGrid({ channel, highlight, currentThumb }: { channel: PostBundle["metadata"]["channel"]; highlight: string; currentThumb: { st: EditorSnapshot["editorState"]["slides"][string]; text: string; img: string | null } | null }) {
  const posts = usePosts({ channel });
  const meta = CHANNEL_META[channel];
  const others = (posts.data?.posts ?? [])
    .filter((p) => p.post_id !== highlight && (p.status === "published" || p.status === "approved" || p.status === "scheduled"))
    .sort((a, b) => (b.published_at ?? b.scheduled_at ?? "9999").localeCompare(a.published_at ?? a.scheduled_at ?? "9999"))
    .slice(0, 8);
  return (
    <div className="grid w-[340px] grid-cols-3 gap-[3px]">
      <div className="relative aspect-square overflow-hidden bg-black">
        {currentThumb && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <SlideCanvas slideState={currentThumb.st} text={currentThumb.text} imageUrl={currentThumb.img} displayWidth={112} />
          </div>
        )}
        <div className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 0 0 0 2px var(--semantic-primary-normal)" }} />
      </div>
      {others.map((p, i) => (
        <div key={p.post_id} className="relative aspect-square overflow-hidden" style={{ background: channelGround(meta.color, i + 2) }}>
          {p.cover_thumb_file_id && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={driveFileUrl(p.cover_thumb_file_id)} alt="" className={cn("size-full object-cover", p.status !== "published" && "opacity-70")} />
          )}
        </div>
      ))}
    </div>
  );
}
