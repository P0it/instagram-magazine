"use client";

import { useRef, useState } from "react";
import { Image as ImageIcon, LayoutTemplate, Palette, Search, Shapes, Type, Upload } from "lucide-react";
import { toast } from "sonner";
import { CUTOUT_PREFIX, type PostBundle, type SlideDef, type StockPhoto, type StockSearchResult } from "@/types";
import { useEditorStore } from "@/stores/editor-store";
import { api, driveFileUrl } from "@/lib/client/api";
import { useInvalidatePosts } from "@/lib/client/queries";
import { cssFontFamily } from "@/lib/render/export";
import { OUTLINE_SHAPES, SHAPES, TEXT_STYLES, makeLayer, type ShapeDef } from "@/lib/render/layer-factory";
import { COLOR_COMBOS, type ColorCombo } from "@/presets/palettes";
import { PanelLabel, fieldClass } from "@/components/md/primitives";
import { cn } from "@/lib/utils";
import { ElementsTab } from "./panel-tabs";
import { TemplatesPanel } from "./templates-panel";

type ToolTab = "templates" | "elements" | "text" | "photos" | "uploads" | "background";

const TABS: { id: ToolTab; label: string; icon: typeof Type }[] = [
  { id: "templates", label: "템플릿", icon: LayoutTemplate },
  { id: "elements", label: "요소", icon: Shapes },
  { id: "text", label: "텍스트", icon: Type },
  { id: "photos", label: "사진", icon: ImageIcon },
  { id: "uploads", label: "업로드", icon: Upload },
  { id: "background", label: "배경", icon: Palette },
];

/** 캔버스 기본 강조색 — 어두운/밝은 배경 모두에서 보이는 파랑 */
const DEFAULT_ACCENT = "#0066FF";

/**
 * 미리캔버스식 왼쪽 도구함: 아이콘 레일 + 서랍. 눌러서 현재 슬라이드에 얹는다.
 * 선택한 탭을 다시 누르면 서랍이 접힌다.
 */
export function Toolbox({ slide, bundle, disabled }: { slide: SlideDef | null; bundle: PostBundle; disabled: boolean }) {
  // 좁은 화면에서는 캔버스를 위해 서랍을 접은 채로 시작 (편집기는 데이터 로드 뒤에 렌더되므로 window 접근 안전)
  const [tab, setTab] = useState<ToolTab | null>(() => (typeof window !== "undefined" && window.innerWidth < 1360 ? null : "templates"));

  return (
    <div className={cn("flex shrink-0", disabled && "pointer-events-none opacity-45")} style={{ boxShadow: "inset -1px 0 0 var(--semantic-line-solid-neutral)" }}>
      <nav className="flex w-[68px] shrink-0 flex-col items-center gap-1 bg-surface py-3" aria-label="도구">
        {TABS.map((t) => {
          const on = tab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              title={t.label}
              aria-pressed={on}
              onClick={() => setTab(on ? null : t.id)}
              className={cn("flex w-[56px] flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-semibold", on ? "bg-fill text-brand" : "text-label-alt hover:bg-fill-alt")}
            >
              <Icon className="size-[20px]" />
              {t.label}
            </button>
          );
        })}
      </nav>
      {tab && slide && (
        <div className="flex w-[272px] shrink-0 flex-col overflow-hidden bg-surface" style={{ boxShadow: "inset 1px 0 0 var(--semantic-line-solid-neutral)" }}>
          <div className="min-h-0 flex-1 overflow-auto px-3.5 pb-6 pt-4">
            {tab === "templates" && <TemplatesPanel slide={slide} bundle={bundle} />}
            {tab === "elements" && <ElementsPanel slide={slide} bundle={bundle} />}
            {tab === "text" && <TextToolPanel slide={slide} />}
            {tab === "photos" && <PhotosPanel slide={slide} bundle={bundle} />}
            {tab === "uploads" && <UploadsPanel slide={slide} bundle={bundle} />}
            {tab === "background" && <BackgroundPanel slide={slide} />}
          </div>
        </div>
      )}
    </div>
  );
}

/** 현재 캔버스 높이·슬라이드의 기본 글자색 — 새 레이어를 가운데에 얹을 때 쓴다 */
function useCanvasInfo(slideId: string) {
  const canvasH = useEditorStore((s) => s.snapshot?.editorState.canvas.height ?? 1350);
  const textColor = useEditorStore((s) => s.snapshot?.editorState.slides[slideId]?.text.color ?? "#FFFFFF");
  const background = useEditorStore((s) => s.snapshot?.editorState.slides[slideId]?.image.background ?? "#0a0a0a");
  return { canvasH, textColor, background };
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="pb-2.5 text-sm font-semibold">{children}</h3>;
}

// ---------------- 텍스트 ----------------
function TextToolPanel({ slide }: { slide: SlideDef }) {
  const addLayer = useEditorStore((s) => s.addLayer);
  const { canvasH, textColor } = useCanvasInfo(slide.id);

  const add = (patch: Parameters<typeof makeLayer>[0]) => addLayer(slide.id, makeLayer({ x: 540, y: Math.round(canvasH / 2), color: textColor, ...patch }));

  return (
    <div className="flex flex-col gap-2.5">
      <Heading>텍스트</Heading>
      <button type="button" onClick={() => add({ kind: "text", key: "text", ...TEXT_STYLES[0].patch })} className="h-10 rounded-[10px] bg-brand text-[13px] font-semibold text-white hover:bg-brand-strong">
        텍스트 상자 추가
      </button>
      <PanelLabel>스타일로 추가</PanelLabel>
      <div className="flex flex-col gap-1.5">
        {TEXT_STYLES.map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.label}
            onClick={() => add({ kind: "text", key: "text", ...t.patch })}
            className="flex flex-col gap-1 rounded-xl bg-fill-alt px-3 py-2.5 text-left hover:bg-fill"
          >
            <span className="truncate leading-tight" style={{ fontFamily: cssFontFamily(t.patch.fontFamily ?? "sans"), fontSize: Math.min(28, Math.max(15, (t.patch.fontSize ?? 60) / 4.2)), fontWeight: (t.patch.weight ?? 700) >= 600 ? 700 : 400, letterSpacing: (t.patch.letterSpacing ?? 0) / 8 }}>
              {t.sample}
            </span>
            <span className="text-[10px] text-label-assistive">{t.label}</span>
          </button>
        ))}
      </div>
      <span className="text-[11px] leading-normal text-label-assistive">캔버스에서 더블클릭하면 오른쪽 입력칸으로 바로 이동해요. 폰트는 오른쪽 속성 패널에서 바꿔요.</span>
    </div>
  );
}

// ---------------- 요소 ----------------
function ShapeThumb({ def, outline }: { def: ShapeDef; outline?: boolean }) {
  const fill = outline ? "none" : "currentColor";
  const stroke = outline ? "currentColor" : "none";
  const common = { fill, stroke, strokeWidth: outline ? 3 : 0 };
  return (
    <svg viewBox="0 0 48 48" className="size-9 text-label-neutral" aria-hidden>
      {def.key === "circle" && <circle cx="24" cy="24" r="19" {...common} />}
      {def.key === "triangle" && <polygon points="24,6 43,41 5,41" {...common} />}
      {def.key === "diamond" && <polygon points="24,4 44,24 24,44 4,24" {...common} />}
      {def.key === "star" && <polygon points="24,4 29.6,17.6 44,18.6 33,28 36.5,42 24,34.4 11.5,42 15,28 4,18.6 18.4,17.6" {...common} />}
      {def.key === "line" && <rect x="4" y="21" width="40" height="5" rx="2.5" {...common} />}
      {def.key === "rect" && <rect x="6" y={def.radius ? 11 : 6} width="36" height={def.radius ? 26 : 36} rx={def.radius ? 8 : 0} {...common} />}
    </svg>
  );
}

function ElementsPanel({ slide, bundle }: { slide: SlideDef; bundle: PostBundle }) {
  const addLayer = useEditorStore((s) => s.addLayer);
  const { canvasH } = useCanvasInfo(slide.id);

  const addShape = (d: ShapeDef, outline: boolean) =>
    addLayer(
      slide.id,
      makeLayer({ kind: "shape", key: d.key, x: 540, y: Math.round(canvasH / 2), width: d.width, height: d.height, radius: d.radius ?? 0, color: outline ? "transparent" : DEFAULT_ACCENT, stroke: outline ? DEFAULT_ACCENT : null, strokeWidth: outline ? 8 : 0 }),
    );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Heading>도형</Heading>
        <div className="grid grid-cols-4 gap-1.5">
          {SHAPES.map((d) => (
            <button key={`${d.key}-${d.label}`} type="button" title={d.label} onClick={() => addShape(d, false)} className="grid aspect-square place-items-center rounded-lg bg-fill-alt hover:bg-fill">
              <ShapeThumb def={d} />
            </button>
          ))}
          {OUTLINE_SHAPES.map((d) => (
            <button key={`o-${d.key}`} type="button" title={d.label} onClick={() => addShape(d, true)} className="grid aspect-square place-items-center rounded-lg bg-fill-alt hover:bg-fill">
              <ShapeThumb def={d} outline />
            </button>
          ))}
        </div>
      </div>
      <ElementsTab slide={slide} bundle={bundle} />
    </div>
  );
}

// ---------------- 업로드 ----------------
function UploadsPanel({ slide, bundle }: { slide: SlideDef; bundle: PostBundle }) {
  const addLayer = useEditorStore((s) => s.addLayer);
  const setSlideAsset = useEditorStore((s) => s.setSlideAsset);
  const markSaved = useEditorStore((s) => s.markSaved);
  const invalidate = useInvalidatePosts();
  const { canvasH } = useCanvasInfo(slide.id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const photos = bundle.assets.filter((a) => !a.name.startsWith(CUTOUT_PREFIX));

  async function upload(files: FileList | File[]) {
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        const res = await api.uploadAsset(bundle.metadata.post_id, f);
        // 업로드가 updated_at 을 올리므로 낙관적 락 기준을 맞춘다
        markSaved(res, useEditorStore.getState().snapshot);
      }
      invalidate(bundle.metadata.post_id);
      toast.success("올렸어요. 눌러서 슬라이드에 얹으세요.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const addAsLayer = (name: string, url: string) => {
    const place = (iw: number, ih: number) => {
      const w = Math.min(760, Math.max(360, iw > ih ? 760 : 560));
      const h = Math.round((w * ih) / Math.max(1, iw));
      addLayer(slide.id, makeLayer({ kind: "image", key: "image", asset: name, x: 540, y: Math.round(canvasH / 2), width: w, height: h }));
    };
    const img = new Image();
    img.onload = () => place(img.naturalWidth, img.naturalHeight);
    img.onerror = () => place(1, 1);
    img.src = url;
  };

  return (
    <div className="flex flex-col gap-3">
      <Heading>업로드</Heading>
      <button
        type="button"
        onClick={() => !busy && fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) void upload(e.dataTransfer.files); }}
        className={cn("grid h-[96px] w-full place-items-center rounded-xl border border-dashed text-xs text-label-assistive transition-colors", dragOver ? "border-brand bg-brand/5" : "border-line hover:bg-fill-alt")}
      >
        {busy ? <span className="text-label-neutral">올리는 중…</span> : <span className="flex items-center gap-1.5"><Upload className="size-4" />사진을 끌어놓거나 클릭 (여러 장 가능)</span>}
      </button>
      <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.target.value = ""; }} />
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-label-alt">내 사진</span>
        <span className="text-[11px] text-label-assistive">{photos.length}장</span>
      </div>
      {photos.length === 0 ? (
        <span className="text-[11px] text-label-assistive">아직 없어요. 위에 사진을 올리면 여기 쌓여요.</span>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {photos.map((a) => {
            const url = driveFileUrl(a.fileId);
            return (
              <div key={a.fileId} className="group relative aspect-square overflow-hidden rounded-[10px] hairline-neutral">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="size-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 flex gap-1 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button type="button" onClick={() => setSlideAsset(slide.id, a.name)} className="flex-1 rounded-md bg-white/90 py-1 text-[10px] font-semibold text-black">배경으로</button>
                  <button type="button" onClick={() => addAsLayer(a.name, url)} className="flex-1 rounded-md bg-brand py-1 text-[10px] font-semibold text-white">추가</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <span className="text-[11px] leading-normal text-label-assistive">&ldquo;배경으로&rdquo;는 슬라이드 전체 배경, &ldquo;추가&rdquo;는 움직이고 줄일 수 있는 사진 레이어로 얹어요.</span>
    </div>
  );
}

// ---------------- 사진 (스톡) ----------------
function PhotosPanel({ slide, bundle }: { slide: SlideDef; bundle: PostBundle }) {
  const setSlideAsset = useEditorStore((s) => s.setSlideAsset);
  const markSaved = useEditorStore((s) => s.markSaved);
  const addSource = useEditorStore((s) => s.addSource);
  const invalidate = useInvalidatePosts();
  const [q, setQ] = useState("");
  const [result, setResult] = useState<StockSearchResult | null>(null);
  const [photos, setPhotos] = useState<StockPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [provider, setProvider] = useState<"pexels" | "unsplash" | undefined>(undefined);

  async function search(query: string, page = 1, prov = provider) {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const r = await api.stockSearch(query.trim(), page, prov);
      setResult(r);
      setPhotos(page === 1 ? r.photos : (prev) => [...prev, ...r.photos]);
    } catch (e) {
      toast.error(`검색 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function use(p: StockPhoto) {
    if (importing) return;
    setImporting(p.id);
    try {
      const res = await api.importStock(bundle.metadata.post_id, p);
      markSaved(res, useEditorStore.getState().snapshot);
      setSlideAsset(slide.id, res.uploaded);
      invalidate(bundle.metadata.post_id);
      // 출처 표기 — 스톡 사진 약관(Pexels/Unsplash)의 크레딧을 "참고 출처"에 남긴다
      addSource({ title: `사진: ${p.author}`, url: p.pageUrl, publisher: p.provider === "pexels" ? "Pexels" : "Unsplash", source_type: "other", note: "스톡 사진" });
      toast.success(`배경으로 적용했어요 · ${p.author} / ${p.provider === "pexels" ? "Pexels" : "Unsplash"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(null);
    }
  }

  const unconfigured = result && !result.configured;

  return (
    <div className="flex flex-col gap-3">
      <Heading>사진</Heading>
      <form onSubmit={(e) => { e.preventDefault(); void search(q); }} className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 opacity-45" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="예: 카페, 디저트, 감성 인테리어" className={cn(fieldClass, "pl-9")} />
      </form>
      {result && result.providers.length > 1 && (
        <div className="flex gap-1.5">
          {result.providers.map((p) => (
            <button key={p} type="button" onClick={() => { setProvider(p); void search(q, 1, p); }} className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", (provider ?? result.providers[0]) === p ? "bg-fill text-brand" : "bg-fill-alt text-label-alt")}>
              {p === "pexels" ? "Pexels" : "Unsplash"}
            </button>
          ))}
        </div>
      )}
      {unconfigured && (
        <div className="rounded-xl bg-fill-alt p-3 text-[11px] leading-relaxed text-label-alt">
          <b className="text-label-neutral">스톡 사진 검색 키가 없어요.</b>
          <br />
          무료 키를 발급해 <code>.env.local</code> 에 넣으면 이 탭에서 바로 검색돼요.
          <br />· <code>PEXELS_API_KEY</code> — pexels.com/api
          <br />· <code>UNSPLASH_ACCESS_KEY</code> — unsplash.com/developers
          <br />서버를 다시 시작하면 적용돼요. 키는 서버에만 저장되고 브라우저로 내려가지 않아요.
        </div>
      )}
      {!result && !loading && <span className="text-[11px] text-label-assistive">검색어를 입력하고 Enter. 고른 사진은 이 슬라이드의 배경이 되고, 출처가 &ldquo;참고 출처&rdquo;에 기록돼요.</span>}
      {loading && photos.length === 0 && <span className="text-[11px] text-label-assistive">검색 중…</span>}
      {result?.configured && photos.length === 0 && !loading && <span className="text-[11px] text-label-assistive">결과가 없어요. 다른 단어로 찾아보세요.</span>}
      <div className="grid grid-cols-2 gap-2">
        {photos.map((p) => (
          <button key={p.id} type="button" title={`${p.author} · ${p.provider}`} disabled={!!importing} onClick={() => void use(p)} className="group relative aspect-[3/4] overflow-hidden rounded-[10px] bg-fill-alt hairline-neutral disabled:opacity-60">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.thumb} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-[1.03]" />
            <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-4 text-left text-[10px] font-medium text-white">{importing === p.id ? "가져오는 중…" : p.author}</span>
          </button>
        ))}
      </div>
      {result?.hasMore && (
        <button type="button" disabled={loading} onClick={() => void search(q, result.page + 1)} className="h-[34px] rounded-lg text-[13px] font-semibold text-label-neutral hairline hover:bg-fill-alt disabled:opacity-50">
          {loading ? "불러오는 중…" : "더 보기"}
        </button>
      )}
      <span className="text-[10px] leading-normal text-label-assistive">사진은 Pexels · Unsplash 에서 제공돼요. 상업 이용은 가능하지만 사진을 단독 파일로 재배포할 수 없어요.</span>
    </div>
  );
}

// ---------------- 배경 ----------------
const SOLIDS = ["#0A0A0A", "#171719", "#FFFFFF", "#F5F0E1", "#0B1F3A", "#12372A", "#5A1A25", "#1E40FF", "#FF3D9A", "#FFE680", "#A8F0D8", "#D9CCFF"];

function BackgroundPanel({ slide }: { slide: SlideDef }) {
  const updateSlideState = useEditorStore((s) => s.updateSlideState);
  const setSlideAsset = useEditorStore((s) => s.setSlideAsset);
  const [removePhoto, setRemovePhoto] = useState(true);
  const { background } = useCanvasInfo(slide.id);

  const setBg = (c: string) => {
    updateSlideState(slide.id, (st) => {
      st.image.background = c;
      st.image.overlay.opacity = 0;
      st.image.gradient.direction = "none";
    });
    if (slide.asset) setSlideAsset(slide.id, null);
  };

  const applyCombo = (c: ColorCombo) => {
    updateSlideState(slide.id, (st) => {
      st.image.background = c.bg;
      st.image.overlay.opacity = 0;
      st.image.gradient.direction = "none";
      st.text.color = c.text;
      for (const l of st.layers) if (l.kind === "text") l.color = c.text;
    });
    if (removePhoto && slide.asset) setSlideAsset(slide.id, null);
  };

  return (
    <div className="flex flex-col gap-4">
      <Heading>배경</Heading>
      <div className="flex flex-col gap-2">
        <PanelLabel>단색 배경</PanelLabel>
        <div className="grid grid-cols-6 gap-1.5">
          {SOLIDS.map((c) => (
            <button key={c} type="button" title={c} onClick={() => setBg(c)} className="aspect-square rounded-lg" style={{ background: c, boxShadow: background.toUpperCase() === c ? "0 0 0 2px var(--semantic-primary-normal)" : "inset 0 0 0 1px rgba(23,23,25,0.18)" }} />
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-label-alt">
          직접 고르기
          <input type="color" value={background} onChange={(e) => setBg(e.target.value.toUpperCase())} className="size-7 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
        </label>
        {slide.asset && (
          <button type="button" onClick={() => setSlideAsset(slide.id, null)} className="h-[34px] rounded-lg text-[13px] font-semibold text-label-neutral hairline hover:bg-fill-alt">배경 사진 제거</button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <PanelLabel>색 조합 (배경 + 글자)</PanelLabel>
          <button type="button" onClick={() => setRemovePhoto((v) => !v)} className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", removePhoto ? "bg-brand text-white" : "bg-fill text-label-alt")}>
            {removePhoto ? "사진 제거" : "사진 유지"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {COLOR_COMBOS.map((c) => (
            <button key={c.id} type="button" title={c.tags.join(" · ")} onClick={() => applyCombo(c)} className="flex flex-col gap-1 text-left">
              <div className="relative grid h-[64px] place-items-center overflow-hidden rounded-[10px] hairline-neutral" style={{ background: c.bg }}>
                <span className="text-[17px] font-bold leading-none" style={{ color: c.text }}>가나다 Aa</span>
                <span className="absolute bottom-1.5 right-1.5 size-2.5 rounded-full" style={{ background: c.accent }} />
              </div>
              <span className="truncate text-[10px] text-label-alt">{c.name}</span>
            </button>
          ))}
        </div>
        <span className="text-[11px] leading-normal text-label-assistive">폰트와 색 조합만으로도 콘텐츠가 서요. 누르면 배경·글자색이 바뀌고, 텍스트 레이어 색도 같이 맞춰져요.</span>
      </div>
    </div>
  );
}
