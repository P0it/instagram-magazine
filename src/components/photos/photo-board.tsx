"use client";

import { useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import type { StockPhoto } from "@/types";
import { api } from "@/lib/client/api";
import { useInvalidatePosts, usePosts } from "@/lib/client/queries";
import { PROVIDER_SHORT } from "@/presets/photo-moods";
import { fieldClass } from "@/components/md/primitives";
import { PhotoFinder, photoCredit } from "./photo-finder";

/** 배경으로 쓸 수 있는 상태 — 게시됐거나 게시 중인 포스트는 건드리지 않는다 */
const EDITABLE = new Set(["draft", "approved", "scheduled", "failed", "needs_repair"]);

/** 레퍼런스 보드 "사진" 탭 — 무드별로 둘러보고, 마음에 드는 사진을 포스트 에셋(+출처)으로 가져온다 */
export function PhotoBoard() {
  const [picked, setPicked] = useState<StockPhoto | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 max-w-[640px] text-[13px] leading-relaxed text-label-alt">
        배경으로 쓸 사진을 무드별로 찾아요. 사진을 누르면 어느 포스트에 가져올지 고를 수 있고, 가져온 사진은 에디터의 업로드 탭에서 &ldquo;배경으로&rdquo;를 눌러 쓰면 돼요.
      </p>
      <PhotoFinder onPick={setPicked} busyId={null} gridClass="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]" inputClass={`${fieldClass} sm:max-w-[360px]`} />
      {picked && <ImportDialog photo={picked} onClose={() => setPicked(null)} />}
    </div>
  );
}

function ImportDialog({ photo, onClose }: { photo: StockPhoto; onClose: () => void }) {
  const posts = usePosts({});
  const invalidate = useInvalidatePosts();
  const [busy, setBusy] = useState<string | null>(null);
  const list = (posts.data?.posts ?? []).filter((p) => EDITABLE.has(p.status)).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 30);

  async function importTo(postId: string) {
    if (busy) return;
    setBusy(postId);
    try {
      const res = await api.importStock(postId, photo);
      // 출처 기록 — 같은 URL 이 이미 있으면 건너뛴다
      if (!res.sources.items.some((s) => s.url === photo.pageUrl)) {
        await api.savePost(postId, {
          expected_updated_at: res.metadata.updated_at,
          sources: { items: [...res.sources.items, { title: `사진: ${photo.author}`, url: photo.pageUrl, publisher: PROVIDER_SHORT[photo.provider], source_type: "other", note: photo.license ?? "스톡 사진" }] },
        });
      }
      invalidate(postId);
      toast.success(`가져왔어요 · ${photoCredit(photo)}. 에디터 업로드 탭에서 배경으로 쓰세요.`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div role="dialog" aria-label="사진 가져오기" onClick={(e) => e.stopPropagation()} className="flex max-h-[88vh] w-[min(720px,100%)] gap-5 overflow-hidden rounded-2xl bg-bg p-5 shadow-e-lg max-sm:flex-col max-sm:overflow-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.thumb} alt="" className="max-h-[420px] w-[240px] shrink-0 rounded-xl object-cover max-sm:w-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-semibold">{photo.author}</span>
              <span className="text-[11px] text-label-alt">{PROVIDER_SHORT[photo.provider]}{photo.license ? ` · ${photo.license}` : ""}</span>
              <a href={photo.pageUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] font-semibold text-brand"><ExternalLink className="size-3" />원본 페이지</a>
            </div>
            <button type="button" onClick={onClose} aria-label="닫기" className="grid size-8 shrink-0 place-items-center rounded-lg text-label-alt hover:bg-fill-alt"><X className="size-4" /></button>
          </div>
          <span className="text-[13px] font-semibold">어느 포스트에 가져올까요?</span>
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto">
            {posts.isLoading && <span className="text-[11px] text-label-assistive">불러오는 중…</span>}
            {!posts.isLoading && list.length === 0 && <span className="text-[11px] text-label-assistive">가져올 수 있는 포스트가 없어요. 먼저 초안을 만들어 주세요.</span>}
            {list.map((p) => (
              <button key={p.post_id} type="button" disabled={!!busy} onClick={() => void importTo(p.post_id)} className="flex items-center justify-between gap-2 rounded-lg bg-fill-alt px-3 py-2 text-left hover:bg-fill disabled:opacity-60">
                <span className="truncate text-[13px] font-semibold">{p.headline || p.topic || p.post_id}</span>
                <span className="shrink-0 text-[11px] text-label-assistive">{busy === p.post_id ? "가져오는 중…" : p.channel}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
