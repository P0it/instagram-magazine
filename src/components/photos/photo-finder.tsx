"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import type { LibraryPhoto, StockPhoto, StockProvider, StockSearchResult } from "@/types";
import { api, driveFileUrl } from "@/lib/client/api";
import { useLibraryPhotos } from "@/lib/client/queries";
import { cn } from "@/lib/utils";
import { moodQuery, PHOTO_MOODS, PROVIDER_LABEL, PROVIDER_SHORT, type PhotoMood } from "@/presets/photo-moods";

/** 출처 표기 한 줄 — "참고 출처"에 남길 때도 쓴다 */
export function photoCredit(p: StockPhoto): string {
  return `${p.author} / ${PROVIDER_SHORT[p.provider]}`;
}

function fromLibrary(p: LibraryPhoto): StockPhoto {
  const url = driveFileUrl(p.fileId);
  return { id: `library-${p.id}`, libraryId: p.id, provider: "library", thumb: url, full: url, width: p.width, height: p.height, author: p.author || p.site, authorUrl: p.pageUrl, pageUrl: p.pageUrl, license: `${p.site} · ${p.license}` };
}

/**
 * 배경 사진 찾기 — 무드 칩 + 검색 + 소스 전환. 고른 사진은 onPick 으로 넘긴다(가져오기는 호출한 쪽이 처리).
 * 에디터 사이드패널(좁게)과 레퍼런스 보드 "사진" 탭(넓게)이 같이 쓴다.
 */
export function PhotoFinder({
  onPick,
  busyId,
  gridClass,
  inputClass,
}: {
  onPick: (p: StockPhoto) => void;
  busyId: string | null;
  gridClass: string;
  inputClass: string;
}) {
  const [q, setQ] = useState("");
  const [mood, setMood] = useState<string | null>(null);
  const [providers, setProviders] = useState<StockProvider[]>([]);
  const [provider, setProvider] = useState<StockProvider | undefined>(undefined);
  const library = useLibraryPhotos().data?.photos ?? [];
  const [result, setResult] = useState<StockSearchResult | null>(null);
  const [photos, setPhotos] = useState<StockPhoto[]>([]);
  const [loading, setLoading] = useState(false);

  // 쓸 수 있는 소스 목록 — 빈 검색은 서버가 목록만 돌려준다
  useEffect(() => {
    let live = true;
    api.stockSearch("").then((r) => live && setProviders(r.providers)).catch(() => {});
    return () => { live = false; };
  }, []);

  // 모아둔 사진이 있으면 그걸 먼저 보여준다
  const active: StockProvider | undefined = provider ?? (library.length > 0 ? "library" : providers[0]);
  const inLibrary = active === "library";
  const needle = q.trim().toLowerCase();
  const libraryShown = inLibrary
    ? library.filter((p) => (!mood || p.mood === mood) && (!needle || [p.site, p.author, ...p.tags].some((t) => t.toLowerCase().includes(needle)))).map(fromLibrary)
    : [];
  const shown = inLibrary ? libraryShown : photos;

  async function search(query: string, page = 1, prov = active) {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const r = await api.stockSearch(query.trim(), page, prov);
      setResult(r);
      setPhotos((prev) => (page === 1 ? r.photos : [...prev, ...r.photos]));
    } catch (e) {
      toast.error(`검색 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  function pickMood(m: PhotoMood) {
    setMood(m.id);
    setQ("");
    if (!inLibrary) void search(moodQuery(m, active), 1, active);
  }

  function pickProvider(p: StockProvider) {
    setProvider(p);
    if (p === "library") return;
    const m = PHOTO_MOODS.find((x) => x.id === mood);
    const query = q.trim() || (m ? moodQuery(m, p) : "");
    if (query) void search(query, 1, p);
  }

  const query = q.trim() || (mood ? moodQuery(PHOTO_MOODS.find((m) => m.id === mood)!, active) : "");
  const keyless = providers.length > 0 && !providers.includes("pexels") && !providers.includes("unsplash");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {PHOTO_MOODS.map((m) => (
          <button key={m.id} type="button" title={m.hint} onClick={() => pickMood(m)} className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", mood === m.id && !q.trim() ? "bg-brand text-white" : "bg-fill-alt text-label-alt hover:bg-fill")}>{m.label}</button>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (inLibrary) return; setMood(null); void search(q); }} className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 opacity-45" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={inLibrary ? "사이트·작가·태그로 거르기" : "직접 검색 (영어가 더 잘 나와요)"} aria-label="사진 검색" className={cn(inputClass, "pl-9")} />
      </form>
      {(providers.length > 1 || library.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {[...(library.length > 0 ? (["library"] as const) : []), ...providers].map((p) => (
            <button key={p} type="button" title={PROVIDER_LABEL[p]} onClick={() => pickProvider(p)} className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", active === p ? "bg-fill text-brand" : "bg-fill-alt text-label-alt")}>{PROVIDER_SHORT[p]}</button>
          ))}
        </div>
      )}
      {keyless && (
        <div className="rounded-xl bg-fill-alt p-3 text-[11px] leading-relaxed text-label-alt">
          지금은 시카고 미술관 퍼블릭 도메인만 검색돼요. 현대 사진까지 보려면 무료 키를 <code>.env.local</code> 에 넣고 서버를 다시 시작하세요.
          <br />· <code>PEXELS_API_KEY</code> — pexels.com/api
          <br />· <code>UNSPLASH_ACCESS_KEY</code> — unsplash.com/developers
        </div>
      )}
      {inLibrary && shown.length === 0 && <span className="text-[11px] text-label-assistive">이 무드로 모아둔 사진이 아직 없어요. 다른 무드를 누르거나 위에서 소스를 바꿔 보세요.</span>}
      {!inLibrary && !result && !loading && <span className="text-[11px] text-label-assistive">무드를 누르거나 검색어를 입력하세요. 고른 사진은 출처와 함께 저장돼요.</span>}
      {!inLibrary && loading && photos.length === 0 && <span className="text-[11px] text-label-assistive">검색 중…</span>}
      {!inLibrary && result && photos.length === 0 && !loading && <span className="text-[11px] text-label-assistive">결과가 없어요. 다른 무드나 단어로 찾아보세요.</span>}
      <div className={gridClass}>
        {shown.map((p) => (
          <button key={p.id} type="button" title={`${photoCredit(p)}${p.license ? ` · ${p.license}` : ""}`} disabled={!!busyId} onClick={() => onPick(p)} className="group relative aspect-[3/4] overflow-hidden rounded-[10px] bg-fill-alt hairline-neutral disabled:opacity-60">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.thumb} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-[1.03]" />
            <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-4 text-left text-[10px] font-medium text-white">{busyId === p.id ? "가져오는 중…" : p.author}</span>
          </button>
        ))}
      </div>
      {!inLibrary && result?.hasMore && (
        <button type="button" disabled={loading} onClick={() => void search(query, result.page + 1)} className="h-[34px] rounded-lg text-[13px] font-semibold text-label-neutral hairline hover:bg-fill-alt disabled:opacity-50">
          {loading ? "불러오는 중…" : "더 보기"}
        </button>
      )}
      <span className="text-[10px] leading-normal text-label-assistive">Pexels·Unsplash 는 상업 이용이 가능하지만 사진을 단독 파일로 재배포할 수 없어요. 시카고 미술관 작품은 CC0(퍼블릭 도메인)이에요. 어디서 가져왔는지는 &ldquo;참고 출처&rdquo;에 기록돼요.</span>
    </div>
  );
}
