"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ImagePlus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { FORMAT_INFO, POST_FORMATS, type PostFormat } from "@/types";
import { accountMeta, useAccountList, useChannel } from "@/lib/client/channel";
import { useAiProviders, useCreateAiJob } from "@/lib/client/queries";
import { fieldClass } from "@/components/md/primitives";
import { cn } from "@/lib/utils";

export type GenerateSource = { kind: "reference" | "template"; id: string; title: string };

const MAX_FILES = 6;
const MAX_BYTES = 10 * 1024 * 1024;
const SLIDE_COUNTS = [3, 4, 5, 6, 7, 8, 9, 10] as const;

/** "AI로 생성하기" — 지침과 사진(선택)을 받아 비동기 생성 작업을 올린다. 결과는 콘텐츠 만들기에 draft 로 나타난다. */
export function GenerateDialog({ open, onClose, onStarted, source }: { open: boolean; onClose: () => void; onStarted?: () => void; source: GenerateSource }) {
  const providers = useAiProviders();
  const create = useCreateAiJob();
  const { accounts } = useAccountList();
  const [channel] = useChannel();
  const fileRef = useRef<HTMLInputElement>(null);
  const [accountKey, setAccountKey] = useState<string | null>(null);
  const [format, setFormat] = useState<PostFormat>("4:5");
  const [slideCount, setSlideCount] = useState<number | null>(null);
  const [brief, setBrief] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  const chosenAccount = accountKey ?? channel ?? accounts[0]?.key ?? "";
  const connected = providers.data?.providers.some((p) => p.connected) ?? false;
  const noProvider = providers.isSuccess && !connected;

  if (!open) return null;

  const addFiles = (list: FileList) => {
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!["image/png", "image/jpeg", "image/webp"].includes(f.type)) {
        toast.error(`${f.name}: PNG·JPEG·WebP 사진만 넣을 수 있어요`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name}: 사진은 ${MAX_BYTES / 1024 / 1024}MB 까지예요`);
        continue;
      }
      if (next.length >= MAX_FILES) {
        toast.error(`사진은 ${MAX_FILES}장까지 넣을 수 있어요`);
        break;
      }
      next.push(f);
    }
    setFiles(next);
  };

  const submit = () => {
    if (!chosenAccount || create.isPending) return;
    create.mutate(
      {
        meta: {
          account_key: chosenAccount,
          ...(source.kind === "reference" ? { reference_id: source.id } : { template_id: source.id }),
          brief: brief.trim(),
          format,
          ...(slideCount ? { slide_count: slideCount } : {}),
        },
        files,
      },
      {
        onSuccess: () => {
          setBrief("");
          setFiles([]);
          onClose();
          onStarted?.();
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      <div role="dialog" aria-label="AI로 생성하기" className="relative flex max-h-[90dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-surface shadow-e-md">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="flex items-center gap-2 text-base font-semibold"><Sparkles className="size-4 text-brand" />AI로 생성하기</h2>
          <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-full hover:bg-fill"><X className="size-4 opacity-60" /></button>
        </div>

        {noProvider ? (
          <div className="flex flex-col gap-3 px-5 pb-6 pt-2 text-sm">
            <p className="m-0 text-label-alt">AI 로그인이 필요해요. Claude 나 ChatGPT 구독 계정을 설정에서 연결하면 바로 쓸 수 있어요.</p>
            <Link href="/settings/ai" className="flex h-10 w-fit items-center rounded-[10px] bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong">설정 &gt; AI 로 가기</Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5 overflow-auto px-5 pb-5 pt-2">
            <p className="m-0 text-[13px] text-label-alt">
              <b className="text-label">{source.title}</b> 의 {source.kind === "reference" ? "구성과 분위기" : "스타일"}를 참고해서 캐러셀을 만들어요. 끝나면 초안으로 나타나요.
            </p>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-label-alt">어느 채널에 만들까요</span>
              <select value={chosenAccount} onChange={(e) => setAccountKey(e.target.value)} className={fieldClass} aria-label="채널">
                {accounts.length === 0 && <option value="">채널이 없어요</option>}
                {accounts.map((a) => (
                  <option key={a.key} value={a.key}>{accountMeta(a).title}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-label-alt">어떤 내용으로 쓸까요</span>
              <textarea value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={4000} rows={5} placeholder="예: 성수동 봄 카페 3곳. 창가 자리와 디저트 위주로, 저장하고 싶어지게." aria-label="지침" className={cn(fieldClass, "resize-y leading-normal")} />
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-label-alt">사진 (선택, 최대 {MAX_FILES}장)</span>
              <div className="flex flex-wrap items-center gap-2">
                {previews.map((p, i) => (
                  <span key={p} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt="" className="h-[64px] w-[52px] rounded-md object-cover hairline-neutral" />
                    <button type="button" aria-label="사진 빼기" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-surface shadow-e-sm"><X className="size-3" /></button>
                  </span>
                ))}
                {files.length < MAX_FILES && (
                  <button type="button" onClick={() => fileRef.current?.click()} title="사진 추가" className="grid h-[64px] w-[52px] place-items-center rounded-md border border-dashed border-line text-label-alt hover:bg-fill-alt"><ImagePlus className="size-4" /></button>
                )}
                <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-label-alt">규격</span>
              <div className="flex flex-wrap gap-1.5">
                {POST_FORMATS.map((f) => (
                  <button key={f} type="button" title={FORMAT_INFO[f].hint} onClick={() => setFormat(f)} className={cn("rounded-full px-3 py-1 text-xs font-semibold", format === f ? "bg-fill text-brand" : "bg-fill-alt text-label-alt")}>{f} · {FORMAT_INFO[f].label}</button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-label-alt">슬라이드 수</span>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setSlideCount(null)} className={cn("rounded-full px-3 py-1 text-xs font-semibold", slideCount === null ? "bg-fill text-brand" : "bg-fill-alt text-label-alt")}>자동</button>
                {SLIDE_COUNTS.map((n) => (
                  <button key={n} type="button" onClick={() => setSlideCount(n)} className={cn("rounded-full px-3 py-1 text-xs font-semibold", slideCount === n ? "bg-fill text-brand" : "bg-fill-alt text-label-alt")}>{n}장</button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="h-10 rounded-[10px] px-4 text-sm font-semibold text-label-neutral hover:bg-fill">취소</button>
              <button type="button" disabled={!chosenAccount || create.isPending} onClick={submit} className="h-10 rounded-[10px] bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50">{create.isPending ? "올리는 중…" : "생성 시작"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** 상세 화면에 붙이는 버튼 + 다이얼로그. `onStarted` 는 생성이 시작된 뒤 상세를 닫아 상단 진행 표시가 보이게 할 때 쓴다. */
export function AiGenerateButton({ source, onStarted, className }: { source: GenerateSource; onStarted?: () => void; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="이 레퍼런스를 참고해서 캐러셀 초안을 만들어요" className={cn("flex h-10 items-center gap-1.5 rounded-[10px] bg-fill px-4 text-sm font-semibold text-brand hover:bg-fill-alt", className)}>
        <Sparkles className="size-4" />AI로 생성하기
      </button>
      <GenerateDialog open={open} onClose={() => setOpen(false)} onStarted={onStarted} source={source} />
    </>
  );
}
