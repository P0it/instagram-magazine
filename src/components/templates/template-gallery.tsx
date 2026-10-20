"use client";

import { useMemo, useState } from "react";
import { TEMPLATE_CATEGORIES, TEMPLATE_CATEGORY_LABEL, type Template } from "@/types";
import { useTemplates } from "@/lib/client/queries";
import { BUILTIN_TEMPLATES } from "@/presets/templates";
import { cn } from "@/lib/utils";
import { TemplateThumb } from "./template-thumb";

type Filter = "all" | "mine" | (typeof TEMPLATE_CATEGORIES)[number];

/** 템플릿 탭 — 내장 + 내 템플릿을 둘러본다. (에디터에서 적용하는 흐름은 에디터의 템플릿 서랍이 맡는다) */
export function TemplateGallery() {
  const custom = useTemplates();
  const [filter, setFilter] = useState<Filter>("all");
  const mine = useMemo(() => custom.data?.templates ?? [], [custom.data]);
  const list: Template[] = useMemo(() => {
    const all = [...mine, ...BUILTIN_TEMPLATES];
    if (filter === "all") return all;
    if (filter === "mine") return mine;
    return all.filter((t) => t.category === filter);
  }, [mine, filter]);

  const chips: { id: Filter; label: string }[] = [
    { id: "all", label: "전체" },
    ...TEMPLATE_CATEGORIES.map((c) => ({ id: c as Filter, label: TEMPLATE_CATEGORY_LABEL[c] })),
    { id: "mine", label: `내가 만든 것 ${mine.length}` },
  ];

  return (
    <div className="mx-auto box-border flex w-full max-w-[1560px] flex-1 flex-col gap-6 overflow-auto px-6 pb-20 pt-8">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-bold leading-8 tracking-[-0.023em]">템플릿</h1>
        <span className="text-[13px] text-label-alt">레퍼런스에서 뽑아낸 구성이에요. 에디터의 템플릿 서랍에서 슬라이드에 적용할 수 있어요.</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button key={c.id} type="button" onClick={() => setFilter(c.id)} className={cn("rounded-full px-3.5 py-1.5 text-[13px]", filter === c.id ? "bg-label font-semibold text-surface-alt" : "bg-elevated text-label hover:bg-fill-strong")}>{c.label}</button>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="rounded-2xl bg-surface p-8 text-center text-[13px] text-label-alt">{filter === "mine" ? "아직 저장한 템플릿이 없어요. 에디터에서 슬라이드를 꾸민 뒤 '내 템플릿으로 저장'을 눌러 보세요." : "이 분류에는 템플릿이 없어요."}</div>
      ) : (
        <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
          {list.map((t) => (
            <div key={t.id} data-testid="template-card" className="flex flex-col gap-2">
              <TemplateThumb tpl={t} canvasH={1350} displayWidth={210} />
              <div className="flex flex-col">
                <span className="truncate text-sm font-semibold">{t.source !== "builtin" && <span className="mr-1.5 inline-block size-[6px] rounded-full bg-brand align-middle" />}{t.name}</span>
                <span className="text-xs text-label-alt">4:5 · {TEMPLATE_CATEGORY_LABEL[t.category]}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
