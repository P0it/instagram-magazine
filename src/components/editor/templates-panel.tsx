"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TEMPLATE_CATEGORIES, TEMPLATE_CATEGORY_LABEL, type PostBundle, type SlideDef, type Template } from "@/types";
import { useEditorStore } from "@/stores/editor-store";
import { api } from "@/lib/client/api";
import { qk, useTemplates } from "@/lib/client/queries";
import { reflowSlideForHeight } from "@/lib/render/layout";
import { BUILTIN_TEMPLATES } from "@/presets/templates";
import { fieldClass } from "@/components/md/primitives";
import { cn } from "@/lib/utils";
import { SlideCanvas } from "./canvas";

/** 사진 템플릿 썸네일에 깔 데모 사진 (SVG data URL — same-origin 이라 canvas taint 없음) */
const DEMO_PHOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9c7ab"/><stop offset="0.6" stop-color="#a87d57"/><stop offset="1" stop-color="#4a3427"/></linearGradient></defs><rect width="1080" height="1350" fill="url(#g)"/><ellipse cx="540" cy="860" rx="330" ry="90" fill="#f4efe6" opacity="0.9"/><rect x="390" y="560" width="300" height="300" rx="20" fill="#fffaf2"/><ellipse cx="540" cy="560" rx="150" ry="34" fill="#5b3a24"/></svg>`,
  );

type Filter = "all" | "mine" | (typeof TEMPLATE_CATEGORIES)[number];

function TemplateThumb({ tpl, canvasH }: { tpl: Template; canvasH: number }) {
  const state = useMemo(() => reflowSlideForHeight(tpl.design, 1350, canvasH), [tpl, canvasH]);
  return (
    <div className="pointer-events-none overflow-hidden rounded-lg hairline-neutral">
      <SlideCanvas slideState={state} text={tpl.sample_text} imageUrl={tpl.photo ? DEMO_PHOTO : null} displayWidth={118} canvasHeight={canvasH} />
    </div>
  );
}

/** 왼쪽 "템플릿" 서랍 — 내장 템플릿 + 내 템플릿. 눌러서 현재 슬라이드에 적용 */
export function TemplatesPanel({ slide, bundle }: { slide: SlideDef; bundle: PostBundle }) {
  void bundle;
  const applyTemplate = useEditorStore((s) => s.applyTemplate);
  const canvasH = useEditorStore((s) => s.snapshot?.editorState.canvas.height ?? 1350);
  const slideState = useEditorStore((s) => s.snapshot?.editorState.slides[slide.id]);
  const custom = useTemplates();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  const mine = useMemo(() => custom.data?.templates ?? [], [custom.data]);
  const list = useMemo(() => {
    const all = [...mine, ...BUILTIN_TEMPLATES];
    if (filter === "all") return all;
    if (filter === "mine") return mine;
    return all.filter((t) => t.category === filter);
  }, [mine, filter]);

  const apply = (t: Template) => {
    applyTemplate(slide.id, t);
    if (t.photo && !slide.asset) toast.message("사진 템플릿이에요. '사진' 또는 '업로드' 탭에서 배경 사진을 골라 보세요.");
  };

  const saveCurrent = async () => {
    if (!slideState || !name.trim()) return;
    try {
      const keep = slideState.layers.filter((l) => l.kind !== "image" && l.kind !== "cutout");
      const file = await api.saveTemplate({
        name: name.trim(),
        category: slide.asset ? "photo" : "color",
        tags: [],
        design: { ...slideState, text: { ...slideState.text, locked: false }, layers: keep },
        sample_text: slide.text,
        photo: !!slide.asset,
        source: "custom",
        note: "",
      });
      qc.setQueryData(qk.templates, file);
      setSaving(false);
      setName("");
      toast.success("내 템플릿으로 저장했어요. (사진·누끼 레이어는 빼고 저장돼요)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async (id: string) => {
    try {
      qc.setQueryData(qk.templates, await api.deleteTemplate(id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const chips: { id: Filter; label: string }[] = [{ id: "all", label: "전체" }, { id: "mine", label: `내 템플릿 ${mine.length}` }, ...TEMPLATE_CATEGORIES.map((c) => ({ id: c as Filter, label: TEMPLATE_CATEGORY_LABEL[c] }))];

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">템플릿</h3>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button key={c.id} type="button" onClick={() => setFilter(c.id)} className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", filter === c.id ? "bg-fill text-brand" : "bg-fill-alt text-label-alt hover:bg-fill")}>
            {c.label}
          </button>
        ))}
      </div>
      {saving ? (
        <div className="flex flex-col gap-2 rounded-xl bg-fill-alt p-2.5">
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void saveCurrent()} placeholder="템플릿 이름" aria-label="템플릿 이름" autoFocus className={cn(fieldClass, "py-2 text-xs")} />
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={() => setSaving(false)} className="h-8 rounded-lg text-xs font-semibold text-label-neutral hairline hover:bg-fill">취소</button>
            <button type="button" disabled={!name.trim()} onClick={() => void saveCurrent()} className="h-8 rounded-lg bg-brand text-xs font-semibold text-white hover:bg-brand-strong disabled:opacity-50">저장</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setSaving(true)} className="h-[34px] rounded-lg text-[13px] font-semibold text-label-neutral hairline hover:bg-fill-alt">현재 슬라이드를 내 템플릿으로 저장</button>
      )}
      {list.length === 0 ? (
        <span className="text-[11px] leading-normal text-label-assistive">{filter === "mine" ? "아직 저장한 템플릿이 없어요. 슬라이드를 꾸민 뒤 위 버튼으로 저장하세요." : "이 분류에는 템플릿이 없어요."}</span>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {list.map((t) => (
            <div key={t.id} className="group relative">
              <button type="button" title={t.tags.join(" · ")} onClick={() => apply(t)} className="flex w-full flex-col gap-1 text-left">
                <TemplateThumb tpl={t} canvasH={canvasH} />
                <span className="truncate text-[11px] leading-tight text-label-alt">{t.source !== "builtin" && <span className="mr-1 inline-block size-[5px] rounded-full bg-brand align-middle" />}{t.name}</span>
              </button>
              {t.source !== "builtin" && (
                <button type="button" title="삭제" onClick={() => void remove(t.id)} className="absolute right-1 top-1 hidden size-6 place-items-center rounded-md bg-surface shadow-e-sm group-hover:grid">
                  <Trash2 className="size-3 opacity-60" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <span className="text-[11px] leading-normal text-label-assistive">적용하면 이 슬라이드의 배경·글자 스타일·요소가 템플릿으로 바뀌어요. 슬라이드의 글과 올려 둔 사진 레이어는 그대로예요. 되돌리기(⌘Z)로 취소할 수 있어요.</span>
    </div>
  );
}
