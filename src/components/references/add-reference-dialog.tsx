"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { REFERENCE_KINDS, REFERENCE_KIND_LABEL, type ReferenceKind } from "@/types";
import { api } from "@/lib/client/api";
import { qk } from "@/lib/client/queries";
import { extractPalette } from "@/lib/render/palette";
import { fieldClass } from "@/components/md/primitives";
import { cn } from "@/lib/utils";

/** 레퍼런스 추가 — 스크린샷을 끌어놓거나 붙여넣기(⌘V). 여러 장이면 캐러셀 한 건으로 저장 */
export function AddReferenceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [palette, setPalette] = useState<string[]>([]);
  const [kind, setKind] = useState<ReferenceKind>("feed");
  const [title, setTitle] = useState("");
  const [account, setAccount] = useState("");
  const [url, setUrl] = useState("");
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // 붙여넣기 핸들러는 effect 안의 클로저라 최신 파일 목록을 ref 로 본다
  const filesRef = useRef<File[]>([]);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const addFiles = (list: FileList | File[]) => {
    const imgs = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (imgs.length === 0) return;
    const prev = filesRef.current;
    const next = [...prev, ...imgs].slice(0, 20);
    filesRef.current = next;
    // 첫 장을 처음 넣을 때 팔레트를 뽑는다
    if (prev.length === 0) void extractPalette(next[0]).then(setPalette);
    setFiles(next);
  };

  // 미리보기 URL 은 파일 목록에서 파생하고, 바뀌면 이전 것을 정리한다
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  // 붙여넣기(⌘V) — 스크린샷을 바로 올린다
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const imgs = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (imgs.length) {
        e.preventDefault();
        addFiles(imgs);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open]);

  const reset = () => {
    filesRef.current = [];
    setFiles([]);
    setPalette([]);
    setTitle("");
    setAccount("");
    setUrl("");
    setTags("");
    setNote("");
    setKind("feed");
  };

  const submit = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const res = await api.createReference(
        { title: title.trim(), kind, account: account.replace(/^@/, "").trim(), url: url.trim(), tags: tags.split(/[,\s#]+/).filter(Boolean).slice(0, 12), note: note.trim(), palette },
        files,
      );
      qc.setQueryData(qk.references, res);
      toast.success("레퍼런스를 저장했어요.");
      reset();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      <div role="dialog" aria-label="레퍼런스 추가" className="relative flex max-h-[90dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl bg-surface shadow-e-md">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-base font-semibold">레퍼런스 추가</h2>
          <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-full hover:bg-fill"><X className="size-4 opacity-60" /></button>
        </div>
        <div className="flex flex-col gap-3.5 overflow-auto px-5 pb-5 pt-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
            className={cn("grid min-h-[120px] w-full place-items-center rounded-xl border border-dashed px-3 py-4 text-xs text-label-assistive transition-colors", dragOver ? "border-brand bg-brand/5" : "border-line hover:bg-fill-alt")}
          >
            {previews.length === 0 ? (
              <span className="flex flex-col items-center gap-1.5"><ImagePlus className="size-5" />스크린샷을 끌어놓거나, 클릭해서 고르거나, <b>⌘V</b> 로 붙여넣기 (캐러셀은 여러 장)</span>
            ) : (
              <span className="flex w-full flex-wrap justify-center gap-2">
                {previews.map((p, i) => (
                  <span key={p} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt="" className="h-[96px] w-[76px] rounded-md object-cover hairline-neutral" />
                    <span onClick={(e) => { e.stopPropagation(); const next = filesRef.current.filter((_, j) => j !== i); filesRef.current = next; setFiles(next); }} className="absolute -right-1.5 -top-1.5 grid size-5 cursor-pointer place-items-center rounded-full bg-surface shadow-e-sm"><X className="size-3" /></span>
                  </span>
                ))}
              </span>
            )}
          </button>
          <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
          {palette.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-label-alt">주요 색</span>
              {palette.map((c) => <span key={c} title={c} className="size-6 rounded-full" style={{ background: c, boxShadow: "inset 0 0 0 1px rgba(23,23,25,0.18)" }} />)}
            </div>
          )}
          <div className="flex gap-1.5">
            {REFERENCE_KINDS.map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={cn("rounded-full px-3 py-1 text-xs font-semibold", kind === k ? "bg-fill text-brand" : "bg-fill-alt text-label-alt")}>{REFERENCE_KIND_LABEL[k]}</button>
            ))}
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목 (예: 블랙 라벨 카페 피드)" aria-label="제목" className={fieldClass} />
          <div className="grid grid-cols-2 gap-2.5">
            <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="계정 / 출처 (@ 없이)" aria-label="계정" className={fieldClass} />
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="원본 링크" aria-label="링크" className={fieldClass} />
          </div>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="태그 (쉼표/공백 구분: 카페 네이비 라벨)" aria-label="태그" className={fieldClass} />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="왜 좋은지 메모 — 폰트, 색 조합, 스티커 위치…" aria-label="메모" className={cn(fieldClass, "resize-y leading-normal")} />
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="h-10 rounded-[10px] px-4 text-sm font-semibold text-label-neutral hover:bg-fill">취소</button>
            <button type="button" disabled={!title.trim() || busy} onClick={() => void submit()} className="h-10 rounded-[10px] bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50">{busy ? "저장 중…" : "저장"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
