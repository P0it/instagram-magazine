"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, ImagePlus, Trash2, Wand2, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { REFERENCE_KINDS, REFERENCE_KIND_LABEL, type Reference, type ReferenceKind } from "@/types";
import { api, driveFileUrl } from "@/lib/client/api";
import { qk } from "@/lib/client/queries";
import { resolvePreset } from "@/presets";
import { slideStateFromPreset } from "@/lib/render/layout";
import { readableOn } from "@/lib/render/palette";
import { fieldClass } from "@/components/md/primitives";
import { cn } from "@/lib/utils";

/** 레퍼런스 상세 — 캐러셀을 넘겨 보고, 메모·태그를 고치고, 템플릿으로 만든다 */
export function ReferenceDetail({ reference: ref, onClose }: { reference: Reference; onClose: () => void }) {
  const qc = useQueryClient();
  const addRef = useRef<HTMLInputElement>(null);
  const [idx, setIdx] = useState(0);
  const [title, setTitle] = useState(ref.title);
  const [account, setAccount] = useState(ref.account);
  const [url, setUrl] = useState(ref.url);
  const [tags, setTags] = useState(ref.tags.join(" "));
  const [note, setNote] = useState(ref.note);
  const [kind, setKind] = useState<ReferenceKind>(ref.kind);
  const [busy, setBusy] = useState<null | "save" | "template" | "images">(null);

  const n = ref.images.length;
  const cur = Math.min(idx, Math.max(0, n - 1));
  const img = ref.images[cur];

  // 방향키로 슬라이드 넘기기, Esc 로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setIdx((i) => Math.min(Math.max(0, n - 1), i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n, onClose]);

  const dirty = title !== ref.title || account !== ref.account || url !== ref.url || note !== ref.note || kind !== ref.kind || tags !== ref.tags.join(" ");

  const save = async () => {
    if (!title.trim()) return;
    setBusy("save");
    try {
      qc.setQueryData(qk.references, await api.patchReference(ref.id, { title: title.trim(), kind, account: account.replace(/^@/, "").trim(), url: url.trim(), note: note.trim(), tags: tags.split(/[,\s#]+/).filter(Boolean).slice(0, 12) }));
      toast.success("저장했어요.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!window.confirm("이 레퍼런스를 삭제할까요? 이미지도 함께 지워져요.")) return;
    try {
      qc.setQueryData(qk.references, await api.deleteReference(ref.id));
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const addImages = async (files: FileList) => {
    setBusy("images");
    try {
      qc.setQueryData(qk.references, await api.addReferenceImages(ref.id, Array.from(files)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const removeImage = async () => {
    if (!img || !window.confirm("이 슬라이드를 지울까요?")) return;
    try {
      qc.setQueryData(qk.references, await api.removeReferenceImage(ref.id, img.name));
      setIdx((i) => Math.max(0, i - 1));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  /**
   * 첫 이미지의 레이아웃을 AI 로 읽고(텍스트 위치·크기·정렬), 추출한 색으로 칠해 "내 템플릿"으로 저장.
   * 분석이 안 되면(키·CLI 없음) 색만 담은 기본 레이아웃 템플릿으로 저장한다.
   */
  const makeTemplate = async () => {
    if (!img || busy) return;
    setBusy("template");
    try {
      let preset = resolvePreset("cover-bottom", undefined, null);
      let textColor: string | null = null;
      let note2 = "";
      let darkBg: boolean | null = null;
      try {
        const blob = await (await fetch(driveFileUrl(img.fileId))).blob();
        const r = await api.analyzeScreenshot(new File([blob], img.name, { type: blob.type || "image/jpeg" }));
        preset = resolvePreset(r.base, r.overrides, null);
        textColor = r.analysis.textColor;
        note2 = r.analysis.note;
        darkBg = r.analysis.background === "dark";
      } catch {
        toast.message("레이아웃 분석을 건너뛰고 색만 담았어요. (API 키 또는 로컬 Claude Code 필요)");
      }
      const pal = ref.palette;
      // 배경: 분석된 밝기에 맞는 가장 비중 큰 색. 없으면 프리셋 기본
      const pick = pal.find((c) => (darkBg === null ? true : (readableOn(c) === "#FFFFFF") === darkBg)) ?? pal[0] ?? preset.toneDefaults.background;
      const design = slideStateFromPreset(preset, "제목을 입력하세요", 1350);
      design.image.background = pick;
      design.image.overlay.opacity = 0;
      design.image.gradient.direction = "none";
      design.text.color = textColor && darkBg !== null ? textColor : readableOn(pick);
      qc.setQueryData(qk.templates, await api.saveTemplate({ name: `${ref.title} 스타일`.slice(0, 40), category: "color", tags: ref.tags, design, sample_text: "제목을 입력하세요", photo: false, source: "reference", note: note2 }));
      toast.success("내 템플릿에 저장했어요. 에디터의 '템플릿' 탭에서 쓸 수 있어요.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const copy = (hex: string) => {
    void navigator.clipboard?.writeText(hex).then(() => toast.success(`${hex} 복사했어요`));
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      <aside role="dialog" aria-label="레퍼런스 상세" className="relative flex h-full w-full max-w-[560px] flex-col overflow-hidden bg-surface shadow-e-md">
        <div className="flex items-center justify-between px-5 py-3.5" style={{ boxShadow: "inset 0 -1px 0 var(--semantic-line-solid-neutral)" }}>
          <span className="text-sm font-semibold">{REFERENCE_KIND_LABEL[ref.kind]}{n > 1 ? ` · ${n}장 캐러셀` : ""}</span>
          <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-full hover:bg-fill"><X className="size-4 opacity-60" /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-5 pb-8 pt-4 [&>*]:shrink-0">
          <div className="relative grid min-h-[320px] place-items-center rounded-xl bg-fill-alt p-3">
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={driveFileUrl(img.fileId)} alt={ref.title} className="max-h-[58dvh] w-auto max-w-full rounded-lg object-contain shadow-e-sm" />
            ) : (
              <span className="text-xs text-label-assistive">이미지가 없어요. 아래에서 추가하세요.</span>
            )}
            {n > 1 && (
              <>
                <button type="button" title="이전 (←)" disabled={cur === 0} onClick={() => setIdx(cur - 1)} className="absolute left-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-surface shadow-e-sm disabled:opacity-30"><ChevronLeft className="size-5" /></button>
                <button type="button" title="다음 (→)" disabled={cur === n - 1} onClick={() => setIdx(cur + 1)} className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-surface shadow-e-sm disabled:opacity-30"><ChevronRight className="size-5" /></button>
                <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white">{cur + 1} / {n}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {ref.images.map((im, i) => (
              <button key={im.fileId} type="button" onClick={() => setIdx(i)} className="size-[58px] shrink-0 overflow-hidden rounded-lg hairline-neutral" style={{ boxShadow: i === cur ? "0 0 0 2px var(--semantic-primary-normal)" : undefined }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={driveFileUrl(im.fileId)} alt="" className="size-full object-cover" />
              </button>
            ))}
            <button type="button" disabled={busy === "images"} onClick={() => addRef.current?.click()} title="슬라이드 추가" className="grid size-[58px] shrink-0 place-items-center rounded-lg border border-dashed border-line text-label-alt hover:bg-fill-alt disabled:opacity-50"><ImagePlus className="size-4" /></button>
            {img && <button type="button" onClick={() => void removeImage()} title="이 슬라이드 삭제" className="grid size-[58px] shrink-0 place-items-center rounded-lg text-negative hover:bg-fill-alt"><Trash2 className="size-4" /></button>}
            <input ref={addRef} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { if (e.target.files?.length) void addImages(e.target.files); e.target.value = ""; }} />
          </div>

          {ref.palette.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-label-alt">주요 색 · 눌러서 복사</span>
              <div className="flex gap-2">
                {ref.palette.map((c) => (
                  <button key={c} type="button" title={c} onClick={() => copy(c)} className="flex flex-col items-center gap-1">
                    <span className="size-9 rounded-full" style={{ background: c, boxShadow: "inset 0 0 0 1px rgba(23,23,25,0.18)" }} />
                    <span className="font-mono text-[10px] text-label-assistive">{c}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-1.5">
            {REFERENCE_KINDS.map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={cn("rounded-full px-3 py-1 text-xs font-semibold", kind === k ? "bg-fill text-brand" : "bg-fill-alt text-label-alt")}>{REFERENCE_KIND_LABEL[k]}</button>
            ))}
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="제목" className={cn(fieldClass, "font-semibold")} />
          <div className="grid grid-cols-2 gap-2.5">
            <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="계정 / 출처" aria-label="계정" className={fieldClass} />
            <div className="relative">
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="원본 링크" aria-label="링크" className={cn(fieldClass, "pr-9")} />
              {/^https?:\/\//.test(url) && <a href={url} target="_blank" rel="noopener noreferrer" title="원본 열기" className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md hover:bg-fill"><ExternalLink className="size-3.5 opacity-60" /></a>}
            </div>
          </div>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="태그 (공백 구분)" aria-label="태그" className={fieldClass} />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="메모 — 폰트, 색 조합, 스티커 위치, 따라 해 볼 점" aria-label="메모" className={cn(fieldClass, "resize-y leading-normal")} />

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" disabled={!dirty || busy === "save"} onClick={() => void save()} className="h-10 rounded-[10px] bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-40">{busy === "save" ? "저장 중…" : "변경 저장"}</button>
            <button type="button" disabled={!img || busy === "template"} onClick={() => void makeTemplate()} title="첫 이미지의 레이아웃·색을 읽어 내 템플릿으로 저장" className="flex h-10 items-center gap-1.5 rounded-[10px] px-4 text-sm font-semibold text-label-neutral hairline hover:bg-fill-alt disabled:opacity-40"><Wand2 className="size-4" />{busy === "template" ? "읽는 중…" : "템플릿으로 만들기"}</button>
            <button type="button" onClick={() => void remove()} className="ml-auto flex h-10 items-center gap-1.5 rounded-[10px] px-3 text-sm font-semibold text-negative hover:bg-fill-alt"><Trash2 className="size-4" />삭제</button>
          </div>
        </div>
      </aside>
    </div>
  );
}
