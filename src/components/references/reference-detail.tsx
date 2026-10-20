"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, ImagePlus, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HOOK_LABEL, REFERENCE_KINDS, REFERENCE_KIND_LABEL, type ApplyResult, type Reference, type ReferenceKind } from "@/types";
import { likeRate } from "@/lib/references/stats";
import { api, driveFileUrl } from "@/lib/client/api";
import { qk } from "@/lib/client/queries";
import { stepSlide } from "@/lib/client/slide-index";
import { resolvePreset } from "@/presets";
import { slideStateFromPreset } from "@/lib/render/layout";
import { readableOn } from "@/lib/render/palette";
import { fieldClass } from "@/components/md/primitives";
import { cn } from "@/lib/utils";

/** 레퍼런스 상세 — 캐러셀을 넘겨 보고, 메모·태그를 고치고, 템플릿으로 만든다 */
export function ReferenceDetail({ reference: ref, onClose, onStep }: { reference: Reference; onClose: () => void; /** ↑ ↓ 로 이전/다음 레퍼런스로 */ onStep?: (delta: number) => void }) {
  const qc = useQueryClient();
  const addRef = useRef<HTMLInputElement>(null);
  const [idx, setIdx] = useState(0);
  const [title, setTitle] = useState(ref.title);
  const [account, setAccount] = useState(ref.account);
  const [url, setUrl] = useState(ref.url);
  const [tags, setTags] = useState(ref.tags.join(" "));
  const [note, setNote] = useState(ref.note);
  const [kind, setKind] = useState<ReferenceKind>(ref.kind);
  const [busy, setBusy] = useState<null | "save" | "template" | "images" | "analyze" | "apply">(null);
  const [topic, setTopic] = useState("");
  const [applied, setApplied] = useState<ApplyResult | null>(null);
  const insight = ref.insight;

  const dirtyRef = useRef(false); // 고치던 내용이 있으면 ↑ ↓ 로 다른 레퍼런스로 넘어가지 않는다
  const n = ref.images.length;
  const cur = Math.min(idx, Math.max(0, n - 1));
  const img = ref.images[cur];

  // 방향키로 슬라이드 넘기기, Esc 로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") setIdx((i) => stepSlide(i, -1, n));
      else if (e.key === "ArrowRight") setIdx((i) => stepSlide(i, 1, n));
      else if (e.key === "ArrowUp" && onStep && !dirtyRef.current) { e.preventDefault(); onStep(-1); }
      else if (e.key === "ArrowDown" && onStep && !dirtyRef.current) { e.preventDefault(); onStep(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n, onClose, onStep]);

  const dirty = title !== ref.title || account !== ref.account || url !== ref.url || note !== ref.note || kind !== ref.kind || tags !== ref.tags.join(" ");

  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

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
    if (!window.confirm(`이 레퍼런스를 삭제할까요?${ref.source_id ? " (Drive 파일은 그대로 두고 보드에서만 숨겨요)" : " 이미지도 함께 지워져요."}`)) return;
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

  const analyze = async () => {
    setBusy("analyze");
    try {
      qc.setQueryData(qk.references, await api.analyzeReference(ref.id));
      toast.success("전문가 분석을 마쳤어요.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const apply = async () => {
    if (topic.trim().length < 2) return;
    setBusy("apply");
    try {
      setApplied(await api.applyReference(ref.id, topic.trim()));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const copyText = (t: string) => {
    void navigator.clipboard?.writeText(t).then(() => toast.success("복사했어요"));
  };

  const copy = (hex: string) => {
    void navigator.clipboard?.writeText(hex).then(() => toast.success(`${hex} 복사했어요`));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/80" />
      <aside role="dialog" aria-label="레퍼런스 상세" className="relative grid max-h-[94dvh] w-full max-w-[1120px] overflow-hidden rounded-2xl border border-line bg-surface shadow-e-md md:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-h-0 min-w-0 flex-col overflow-auto bg-black">
          <div className="relative grid min-h-[320px] flex-1 place-items-center p-4">
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={driveFileUrl(img.fileId)} alt={ref.title} className="max-h-[68dvh] w-auto max-w-full rounded-lg object-contain shadow-e-sm" />
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
          <div className="flex items-center justify-center gap-2 overflow-x-auto px-4 pb-4">
            {ref.images.map((im, i) => (
              <button key={im.fileId} type="button" onClick={() => setIdx(i)} className="size-[58px] shrink-0 overflow-hidden rounded-lg hairline-neutral" style={{ boxShadow: i === cur ? "0 0 0 2px var(--semantic-primary-normal)" : undefined }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={driveFileUrl(im.fileId)} alt="" className="size-full object-cover" />
              </button>
            ))}
            {!ref.source_id && <button type="button" disabled={busy === "images"} onClick={() => addRef.current?.click()} title="슬라이드 추가" className="grid size-[58px] shrink-0 place-items-center rounded-lg border border-dashed border-line text-label-alt hover:bg-fill-alt disabled:opacity-50"><ImagePlus className="size-4" /></button>}
            {img && !ref.source_id && <button type="button" onClick={() => void removeImage()} title="이 슬라이드 삭제" className="grid size-[58px] shrink-0 place-items-center rounded-lg text-negative hover:bg-fill-alt"><Trash2 className="size-4" /></button>}
            <input ref={addRef} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { if (e.target.files?.length) void addImages(e.target.files); e.target.value = ""; }} />
          </div>

        </div>
        <div className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between px-5 py-3.5" style={{ boxShadow: "inset 0 -1px 0 var(--semantic-line-solid-neutral)" }}>
            <span className="text-sm font-semibold">{REFERENCE_KIND_LABEL[ref.kind]}{n > 1 ? ` · ${n}장 캐러셀` : ""}</span>
            <button type="button" onClick={onClose} aria-label="상세 닫기" className="grid size-8 place-items-center rounded-full hover:bg-fill"><X className="size-4 opacity-60" /></button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto px-5 pb-8 pt-5 [&>*]:shrink-0">
            <div className="flex flex-col gap-2">
              <h2 className="m-0 text-lg font-bold leading-snug tracking-[-0.02em]">{ref.title}</h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-label-alt">
                {ref.account && <span className="font-semibold text-label-neutral">@{ref.account}</span>}
                {ref.metrics?.likes != null && <span>좋아요 {ref.metrics.likes.toLocaleString("ko-KR")}</span>}
                {ref.metrics?.followers != null && <span>팔로워 {ref.metrics.followers.toLocaleString("ko-KR")}</span>}
                {likeRate(ref) != null && <span title="좋아요 ÷ 팔로워">반응률 {likeRate(ref)!.toFixed(1)}%</span>}
                <span>{n}장</span>
              </div>
              {ref.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {ref.tags.map((t) => <span key={t} className="rounded-full bg-fill-alt px-2.5 py-1 text-xs font-semibold text-label-alt">#{t}</span>)}
                </div>
              )}
            </div>

            {/^https?:\/\//.test(ref.url) && (
              <a href={ref.url} target="_blank" rel="noopener noreferrer" className="flex h-10 items-center justify-center gap-1.5 rounded-[10px] bg-brand text-sm font-semibold text-white hover:bg-brand-strong"><ExternalLink className="size-4" />원본 게시물로 이동</a>
            )}

            {ref.source_id && <p className="m-0 text-caption text-label-alt">Drive 의 references 폴더에서 가져온 레퍼런스예요. 이미지는 Drive 에서 추가·삭제하고, 여기서 삭제하면 보드에서만 숨겨져요.</p>}

            {insight ? (
              <>
                <InsightCard title="큐레이터" sub="무엇을, 어떤 각도로">
                  <Row k="주제" v={insight.curator.topic} />
                  <Row k="각도" v={insight.curator.angle} />
                  <Row k="톤" v={insight.curator.tone} />
                </InsightCard>
                <InsightCard title="마케터" sub="왜 멈추고 넘기고 저장하나">
                  <Row k="훅" v={`${HOOK_LABEL[insight.marketer.hook_type]} — ${insight.marketer.hook_note}`} />
                  <Row k="구성" v={insight.marketer.structure} />
                  <Row k="저장 트리거" v={insight.marketer.save_trigger} />
                  <Row k="마무리" v={insight.marketer.cta} />
                </InsightCard>
                <InsightCard title="UI/UX" sub="레이아웃·글자·색">
                  <Row k="표지" v={insight.uiux.cover_layout} />
                  <Row k="본문" v={insight.uiux.body_layout} />
                  <Row k="글자" v={insight.uiux.typography} />
                  <Row k="정보 밀도" v={{ low: "여유로움", mid: "보통", high: "빽빽함" }[insight.uiux.density]} />
                </InsightCard>
                {insight.why.length > 0 && <Bullets title="왜 먹히나" items={insight.why} />}
                {insight.reuse.length > 0 && <Bullets title="우리 글에 쓰려면" items={insight.reuse} accent />}

                <section className="flex flex-col gap-2 rounded-xl hairline p-4">
                  <span className="text-sm font-bold">내 주제에 적용</span>
                  <span className="text-[12px] leading-snug text-label-alt">이 레퍼런스의 구조(훅·구성)만 가져와 내 주제로 제목 후보와 슬라이드 구성안을 만들어요. 문구는 새로 써요.</span>
                  <div className="flex gap-2">
                    <input value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void apply(); }} placeholder="예: 청년 월세 지원 신청 방법" aria-label="적용할 주제" className={cn(fieldClass, "min-w-0 flex-1")} />
                    <button type="button" disabled={busy === "apply" || topic.trim().length < 2} onClick={() => void apply()} className="h-10 shrink-0 rounded-[10px] bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-40">{busy === "apply" ? "만드는 중…" : "만들기"}</button>
                  </div>
                  {applied && (
                    <div className="flex flex-col gap-3 pt-1">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-label-alt">제목 후보 · 눌러서 복사</span>
                        {applied.titles.map((t) => <button key={t} type="button" onClick={() => copyText(t)} className="rounded-lg bg-fill-alt px-3 py-2 text-left text-[13px] font-semibold hover:bg-fill">{t}</button>)}
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-label-alt">슬라이드 구성안</span>
                        <ol className="m-0 flex list-none flex-col gap-1 p-0">
                          {applied.slides.map((sl, i) => <li key={i} className="grid grid-cols-[44px_minmax(0,1fr)] gap-2 text-[13px] leading-snug"><span className="text-label-assistive">{i + 1}. {sl.role}</span><span>{sl.text}</span></li>)}
                        </ol>
                        <button type="button" onClick={() => copyText(applied.slides.map((sl, i) => `${i + 1}. [${sl.role}] ${sl.text}`).join("\n"))} className="mt-1 w-fit text-xs font-semibold text-brand">구성안 전체 복사</button>
                      </div>
                      {applied.caption_hook && <p className="m-0 text-[13px]"><span className="text-label-assistive">캡션 첫 줄 </span>{applied.caption_hook}</p>}
                      {applied.notes && <p className="m-0 rounded-lg bg-fill-alt p-2.5 text-[12px] leading-snug text-label-alt">{applied.notes}</p>}
                    </div>
                  )}
                </section>
              </>
            ) : (
              <div className="flex flex-col gap-2 rounded-xl bg-fill-alt p-4">
                <span className="text-sm font-semibold">전문가 분석</span>
                <span className="text-[13px] leading-relaxed text-label-alt">큐레이터·마케터·UI/UX 세 관점으로 이 게시물을 읽어, 왜 잘 되는지와 우리 글에 쓰는 법을 정리해요. 슬라이드를 AI 가 읽기 때문에 1분쯤 걸려요.</span>
              </div>
            )}

            {(ref.palette.length > 0 || (insight?.uiux.palette.length ?? 0) > 0) && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-label-alt">주요 색 · 눌러서 복사</span>
                <div className="flex gap-2">
                  {(ref.palette.length > 0 ? ref.palette : insight?.uiux.palette ?? []).map((c) => (
                    <button key={c} type="button" title={c} onClick={() => copy(c)} className="flex flex-col items-center gap-1">
                      <span className="size-9 rounded-full" style={{ background: c, boxShadow: "inset 0 0 0 1px rgba(23,23,25,0.18)" }} />
                      <span className="font-mono text-[10px] text-label-assistive">{c}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {ref.note && <p className="m-0 whitespace-pre-wrap rounded-xl bg-fill-alt p-3 text-[13px] leading-relaxed text-label-neutral">{ref.note}</p>}

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={busy === "analyze" || n === 0} onClick={() => void analyze()} className={cn("flex h-10 items-center gap-1.5 rounded-[10px] px-4 text-sm font-semibold disabled:opacity-50", insight ? "text-label-neutral hairline hover:bg-fill-alt" : "bg-brand text-white hover:bg-brand-strong")}><Sparkles className="size-4" />{busy === "analyze" ? "읽는 중… (1분쯤)" : insight ? "다시 분석" : "전문가 분석 실행"}</button>
              <button type="button" disabled={!img || busy === "template"} onClick={() => void makeTemplate()} title="첫 이미지의 레이아웃·색을 읽어 내 템플릿으로 저장" className="flex h-10 items-center gap-1.5 rounded-[10px] px-4 text-sm font-semibold text-label-neutral hairline hover:bg-fill-alt disabled:opacity-40"><Wand2 className="size-4" />{busy === "template" ? "읽는 중…" : "템플릿으로 만들기"}</button>
            </div>

            <details className="group rounded-xl hairline">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[13px] font-semibold text-label-alt">정보 수정<ChevronRight className="size-4 transition-transform group-open:rotate-90" /></summary>
              <div className="flex flex-col gap-3 px-4 pb-4">
                <div className="flex gap-1.5">
                  {REFERENCE_KINDS.map((k) => (
                    <button key={k} type="button" onClick={() => setKind(k)} className={cn("rounded-full px-3 py-1 text-xs font-semibold", kind === k ? "bg-fill text-brand" : "bg-fill-alt text-label-alt")}>{REFERENCE_KIND_LABEL[k]}</button>
                  ))}
                </div>
                <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="제목" className={cn(fieldClass, "font-semibold")} />
                <div className="grid grid-cols-2 gap-2.5">
                  <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="계정 / 출처" aria-label="계정" className={fieldClass} />
                  <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="원본 링크" aria-label="링크" className={fieldClass} />
                </div>
                <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="태그 (공백 구분)" aria-label="태그" className={fieldClass} />
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="메모" aria-label="메모" className={cn(fieldClass, "resize-y leading-normal")} />
                <div className="flex items-center gap-2">
                  <button type="button" disabled={!dirty || busy === "save"} onClick={() => void save()} className="h-9 rounded-[10px] bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-40">{busy === "save" ? "저장 중…" : "변경 저장"}</button>
                  <button type="button" onClick={() => void remove()} className="ml-auto flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-sm font-semibold text-negative hover:bg-fill-alt"><Trash2 className="size-4" />삭제</button>
                </div>
              </div>
            </details>
          </div>
        </div>
      </aside>
    </div>
  );
}

function InsightCard({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-fill-alt p-4">
      <div className="flex items-baseline gap-2"><span className="text-sm font-bold">{title}</span><span className="text-[11px] text-label-assistive">{sub}</span></div>
      <dl className="m-0 flex flex-col gap-1.5">{children}</dl>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  if (!v) return null;
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2 text-[13px] leading-snug">
      <dt className="text-label-assistive">{k}</dt>
      <dd className="m-0 text-label-neutral">{v}</dd>
    </div>
  );
}

function Bullets({ title, items, accent }: { title: string; items: string[]; accent?: boolean }) {
  return (
    <section className="flex flex-col gap-1.5">
      <span className={cn("text-sm font-bold", accent && "text-brand")}>{title}</span>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {items.map((t) => <li key={t} className="flex gap-2 text-[13px] leading-snug text-label-neutral"><span className={cn("mt-[7px] size-1 shrink-0 rounded-full", accent ? "bg-brand" : "bg-label-assistive")} />{t}</li>)}
      </ul>
    </section>
  );
}
