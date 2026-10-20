"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Plus, Search } from "lucide-react";
import { REFERENCE_KINDS, REFERENCE_KIND_LABEL, type Reference, type ReferenceKind } from "@/types";
import { useReferences } from "@/lib/client/queries";
import { cn } from "@/lib/utils";
import { AddReferenceDialog } from "./add-reference-dialog";
import { ReferenceCard } from "./reference-card";
import { ReferenceDetail } from "./reference-detail";
import { REF_SOURCE_GROUPS } from "./sources";

/** 레퍼런스 보드 — 잘 되는 피드·디자인을 모아 보고, 브레인스토밍하고, 템플릿으로 바꾼다 */
export function ReferenceBoard() {
  const refs = useReferences();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<ReferenceKind | "all">("all");
  const [tag, setTag] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const all = useMemo(() => refs.data?.references ?? [], [refs.data]);
  const tags = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of all) for (const t of r.tags) count.set(t, (count.get(t) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 16);
  }, [all]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((r) => {
      if (kind !== "all" && r.kind !== kind) return false;
      if (tag && !r.tags.includes(tag)) return false;
      if (!needle) return true;
      return [r.title, r.account, r.note, ...r.tags].some((s) => s.toLowerCase().includes(needle));
    });
  }, [all, q, kind, tag]);

  const open = all.find((r) => r.id === openId) ?? null;
  const step = (d: number) => {
    const i = list.findIndex((r) => r.id === openId);
    if (i < 0 || list.length < 2) return;
    setOpenId(list[(i + d + list.length) % list.length].id);
  };

  return (
    <div className="mx-auto box-border flex w-full max-w-[1560px] flex-1 flex-col gap-6 overflow-auto px-6 pb-20 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-2xl font-bold leading-8 tracking-[-0.023em]">레퍼런스 보드</h1>
          <span className="text-[13px] text-label-alt">잘 되는 피드·디자인을 모아 두고 아이디어를 얻는 곳. 마음에 드는 건 템플릿으로 바꿔 에디터에서 써요.</span>
        </div>
        <button type="button" onClick={() => setAdding(true)} className="flex h-10 items-center gap-1.5 rounded-[10px] bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong"><Plus className="size-4" />레퍼런스 추가</button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-[320px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 opacity-45" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목·계정·태그·메모 검색" aria-label="검색" className="h-10 w-full rounded-[10px] bg-fill-alt pl-9 pr-3 text-sm outline-none focus:bg-fill" />
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-fill-alt p-1">
          {(["all", ...REFERENCE_KINDS] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={cn("h-8 rounded-lg px-3 text-[13px] font-semibold", kind === k ? "bg-surface text-label shadow-e-xs" : "text-label-alt")}>{k === "all" ? "전체" : REFERENCE_KIND_LABEL[k]}</button>
          ))}
        </div>
        <span className="text-xs text-label-assistive">{list.length}건</span>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <button key={t} type="button" onClick={() => setTag(tag === t ? null : t)} className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", tag === t ? "bg-brand text-white" : "bg-fill-alt text-label-alt hover:bg-fill")}>#{t}</button>
          ))}
        </div>
      )}

      {refs.isError ? (
        <div className="rounded-2xl bg-surface p-6 text-sm text-negative">레퍼런스를 불러오지 못했어요: {String(refs.error)}</div>
      ) : refs.isLoading ? (
        <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
          {Array.from({ length: 10 }).map((_, i) => <div key={i} className="aspect-[4/6] animate-pulse rounded-xl bg-fill-alt" />)}
        </div>
      ) : all.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface px-6 py-14 text-center">
          <span className="text-base font-semibold">아직 레퍼런스가 없어요</span>
          <span className="max-w-[460px] text-[13px] leading-relaxed text-label-alt">인스타 피드나 디자인 사이트에서 마음에 드는 화면을 스크린샷으로 찍어 올려 보세요. 캐러셀은 여러 장을 한 번에 올리면 넘겨 볼 수 있어요. ⌘V 로 붙여넣기도 돼요.</span>
          <button type="button" onClick={() => setAdding(true)} className="mt-1 flex h-10 items-center gap-1.5 rounded-[10px] bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong"><Plus className="size-4" />첫 레퍼런스 추가</button>
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl bg-surface p-8 text-center text-[13px] text-label-alt">조건에 맞는 레퍼런스가 없어요.</div>
      ) : (
        <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
          {list.map((r) => <ReferenceCard key={r.id} reference={r} onOpen={() => setOpenId(r.id)} />)}
        </div>
      )}

      <section className="flex flex-col gap-4 pt-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="m-0 text-lg font-bold tracking-[-0.02em]">레퍼런스 찾으러 가기</h2>
          <span className="text-[13px] text-label-alt">여기서 찾은 화면은 스크린샷으로 위 보드에 저장하세요. 링크는 새 탭에서 열려요.</span>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {REF_SOURCE_GROUPS.map((g) => (
            <div key={g.title} className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
              <div className="flex flex-col">
                <span className="text-sm font-semibold">{g.title}</span>
                <span className="text-[11px] text-label-assistive">{g.hint}</span>
              </div>
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                {g.items.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-fill-alt">
                      <ExternalLink className="mt-0.5 size-3.5 shrink-0 opacity-40 group-hover:opacity-80" />
                      <span className="flex min-w-0 flex-col"><span className="text-[13px] font-semibold">{s.name}</span><span className="text-[11px] leading-snug text-label-alt">{s.desc}</span></span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <AddReferenceDialog open={adding} onClose={() => setAdding(false)} />
      {open && <ReferenceDetail key={open.id} reference={open} onClose={() => setOpenId(null)} onStep={step} />}
    </div>
  );
}
