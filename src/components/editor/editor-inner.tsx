"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Konva from "konva";
import { toast } from "sonner";
import { ChevronLeft, Eye, Redo2, Undo2 } from "lucide-react";
import { useEditorStore, selectSelectedSlide, selectSelectedLayer } from "@/stores/editor-store";
import { usePost, useSavePost, useStylePacks, useSystemStatus } from "@/lib/client/queries";
import { api, ApiClientError, driveFileUrl } from "@/lib/client/api";
import { exportStageToBlob } from "@/lib/render/export";
import { CHANNEL_DEFAULT_STYLE_PACK } from "@/presets";
import { CHANNEL_META } from "@/lib/client/channel";
import { fmtRelative } from "@/lib/client/format";
import { isTouched } from "@/lib/metadata/stage";
import { BuilderSkeleton } from "@/components/md/skeleton";
import { GhostIcon, StageBadge } from "@/components/md/primitives";
import { SlideCanvas } from "./canvas";
import { SlideStrip } from "./slide-strip";
import { LeftPanel, type LeftTab } from "./left-panel";
import { RightPanel } from "./right-panel";
import { StageArea } from "./stage-area";
import { PreviewMode } from "./preview-mode";
import { PublishSheet } from "@/components/publish/publish-sheet";
import { cn } from "@/lib/utils";

const AUTOSAVE_MS = 1500;
const RENDER_IDLE_MS = 12_000;

type SaveState = "loaded" | "saving" | "saved" | "failed";

export function EditorInner({ postId }: { postId: string }) {
  const router = useRouter();
  const post = usePost(postId);
  const stylePacks = useStylePacks();
  const status = useSystemStatus();
  const save = useSavePost(postId);

  const load = useEditorStore((s) => s.load);
  const markSaved = useEditorStore((s) => s.markSaved);
  const snap = useEditorStore((s) => s.snapshot);
  const loadedId = useEditorStore((s) => s.postId);
  const dirty = useEditorStore((s) => s.dirty);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const selected = useEditorStore(selectSelectedSlide);
  const selectedLayer = useEditorStore(selectSelectedLayer);
  const selection = useEditorStore((s) => s.selection);
  const setSelection = useEditorStore((s) => s.setSelection);
  const select = useEditorStore((s) => s.select);
  const updateMetadata = useEditorStore((s) => s.updateMetadata);
  const updateLayer = useEditorStore((s) => s.updateLayer);
  const removeLayer = useEditorStore((s) => s.removeLayer);
  const duplicateLayer = useEditorStore((s) => s.duplicateLayer);

  const hiddenStageRef = useRef<Konva.Stage>(null);
  const [exportSlide, setExportSlide] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [leftTab, setLeftTab] = useState<LeftTab>("presets");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("loaded");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // 스타일팩 결정: 채널 설정 → 기본
  const stylePack = useMemo(() => {
    if (!post.data) return null;
    const ch = post.data.metadata.channel;
    const packId = status.data?.channels.find((c) => c.key === ch)?.default_style_pack ?? CHANNEL_DEFAULT_STYLE_PACK[ch];
    return stylePacks.data?.packs.find((p) => p.id === packId) ?? null;
  }, [post.data, status.data, stylePacks.data]);

  // 최초 로드 (다른 포스트로 바뀔 때만)
  useEffect(() => {
    if (post.data && loadedId !== postId && stylePacks.isFetched) load(post.data, stylePack);
  }, [post.data, loadedId, postId, load, stylePack, stylePacks.isFetched]);

  // "저장됨 · N분 전" 라벨 갱신
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const readOnly = snap?.metadata.status === "published" || snap?.metadata.status === "publishing";

  // 게시/전이 뒤 서버 상태를 스냅샷에 반영 (낙관적 락 기준 updated_at 포함)
  useEffect(() => {
    const b = post.data;
    if (!b || !snap || loadedId !== postId) return;
    if (b.metadata.status !== snap.metadata.status || (!dirty && b.metadata.updated_at !== snap.metadata.updated_at)) {
      markSaved(b, dirty ? null : snap);
    }
  }, [post.data, snap, loadedId, postId, dirty, markSaved]);

  const assetUrl = useCallback(
    (name: string | null | undefined) => {
      if (!name || !post.data) return null;
      const a = post.data.assets.find((x) => x.name === name);
      return a ? driveFileUrl(a.fileId) : null;
    },
    [post.data],
  );

  /** 메타·에디터 상태만 Drive 에 저장 (렌더 없음). 성공 시 새 번들 반환 */
  const saveNow = useCallback(async () => {
    const s = useEditorStore.getState();
    if (!s.snapshot || readOnly) return null;
    const snapAtSave = s.snapshot;
    setSaveState("saving");
    try {
      const saved = await save.mutateAsync({
        expected_updated_at: s.snapshot.metadata.updated_at,
        metadata: {
          headline: s.snapshot.metadata.headline,
          topic: s.snapshot.metadata.topic,
          caption: s.snapshot.metadata.caption,
          hashtags: s.snapshot.metadata.hashtags,
          alt_text: s.snapshot.metadata.alt_text,
          format: s.snapshot.metadata.format,
          content_type: s.snapshot.metadata.content_type,
          slides: s.snapshot.metadata.slides,
        },
        editorState: s.snapshot.editorState,
        sources: s.snapshot.sources,
      });
      markSaved(saved, snapAtSave);
      setSaveState("saved");
      setSavedAt(Date.now());
      setSaveError(null);
      return saved;
    } catch (e) {
      setSaveState("failed");
      setSaveError(e instanceof ApiClientError && e.status === 409 ? "다른 곳에서 먼저 저장됐어요. 새로고침 후 다시 시도하세요." : e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [save, markSaved, readOnly]);

  // 자동 저장: 마지막 변경 1.5초 뒤
  const saveNowRef = useRef(saveNow);
  useEffect(() => {
    saveNowRef.current = saveNow;
  });
  useEffect(() => {
    if (!dirty || readOnly || saveState === "failed") return;
    const t = setTimeout(() => void saveNowRef.current(), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [dirty, snap, readOnly, saveState]);

  /** 모든 슬라이드를 숨은 스테이지에서 순서대로 렌더해 JPEG Blob 배열로 */
  const renderAll = useCallback(async (): Promise<Blob[]> => {
    const s = useEditorStore.getState().snapshot;
    if (!s) return [];
    const blobs: Blob[] = [];
    for (const sl of s.metadata.slides) {
      setExportSlide(sl.id);
      await new Promise((r) => setTimeout(r, 120)); // 이미지·필터 캐시 반영 대기
      await waitForImages(hiddenStageRef.current);
      const stage = hiddenStageRef.current;
      if (!stage) throw new Error("export stage missing");
      blobs.push(await exportStageToBlob(stage, 0.92, s.editorState.canvas.height));
    }
    setExportSlide(null);
    return blobs;
  }, []);

  /** 저장 → 렌더 → 업로드. 게시 직전과 유휴 시점에 호출 */
  const saveAndRender = useCallback(async () => {
    const saved = useEditorStore.getState().dirty ? await saveNowRef.current() : post.data;
    if (!saved) return null;
    const snapAtRender = useEditorStore.getState().snapshot;
    const blobs = await renderAll();
    const withRenders = await api.uploadRenders(postId, blobs);
    markSaved(withRenders, snapAtRender);
    return withRenders;
  }, [postId, renderAll, markSaved, post.data]);

  // 유휴 렌더: 마지막 변경 12초 뒤, 저장이 끝난 상태에서만
  const renderedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!snap || dirty || readOnly || saveState !== "saved" || exportSlide) return;
    const key = snap.metadata.updated_at;
    if (renderedFor.current === key) return;
    const t = setTimeout(() => {
      renderedFor.current = key;
      saveAndRender()
        // 렌더 업로드도 updated_at 을 올리므로, 그 값을 "렌더 완료" 로 기억해 루프를 막는다
        .then((b) => { if (b) renderedFor.current = b.metadata.updated_at; })
        .catch((e) => console.warn("[render] idle render failed", e));
    }, RENDER_IDLE_MS);
    return () => clearTimeout(t);
  }, [snap, dirty, readOnly, saveState, exportSlide, saveAndRender]);

  // 이탈 경고
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // 단축키
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
      const mod = e.metaKey || e.ctrlKey;
      const st = useEditorStore.getState();
      if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key === "s") {
        e.preventDefault();
        void saveNowRef.current();
        return;
      }
      if (readOnly) return;
      const L = selectSelectedLayer(st);
      const sid = st.selectedSlideId;
      if (mod && (e.key === "d" || e.key === "D") && L && sid) {
        e.preventDefault();
        duplicateLayer(sid, L.id);
        return;
      }
      if (L && sid && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        removeLayer(sid, L.id);
        return;
      }
      if (L && sid && !L.locked && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 20 : 4;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        updateLayer(sid, L.id, { x: Math.max(0, Math.min(1080, L.x + dx)), y: Math.max(0, Math.min(st.snapshot?.editorState.canvas.height ?? 1350, L.y + dy)) });
        return;
      }
      if (e.key === "Escape") {
        setSelection(null);
        return;
      }
      if (!L && st.snapshot && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        const slides = st.snapshot.metadata.slides;
        const i = slides.findIndex((x) => x.id === sid);
        const j = e.key === "ArrowLeft" ? Math.max(0, i - 1) : Math.min(slides.length - 1, i + 1);
        if (slides[j]) select(slides[j].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, readOnly, duplicateLayer, removeLayer, updateLayer, setSelection, select]);

  if (post.isError) {
    return <div className="p-8 text-sm text-negative">포스트를 불러올 수 없습니다: {String(post.error)}</div>;
  }
  if (!post.data || !snap || loadedId !== postId) {
    return <BuilderSkeleton />;
  }

  const bundle = post.data;
  const m = snap.metadata;
  const selectedState = selected ? snap.editorState.slides[selected.id] : null;
  const exportingSlide = exportSlide ? m.slides.find((s) => s.id === exportSlide) : null;
  const exportingState = exportingSlide ? snap.editorState.slides[exportingSlide.id] : null;
  const touched = isTouched({ render_count: bundle.renders.length, created_at: m.created_at, updated_at: m.updated_at });
  const isPreview = mode === "preview";
  const saveLabel =
    saveState === "saving" ? "저장 중…" : saveState === "failed" ? "저장 안 됨" : dirty ? "변경됨" : saveState === "saved" ? `저장됨 · ${fmtRelative(savedAt ? new Date(savedAt).toISOString() : null)}` : readOnly ? "읽기 전용" : "Drive에서 불러옴";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-alt">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 bg-surface px-4" style={{ boxShadow: "inset 0 -1px 0 var(--semantic-line-solid-neutral)" }}>
        <div className="flex min-w-0 items-center gap-3">
          <Link href={`/home?ch=${m.channel}`} className="flex items-center gap-1 rounded-lg py-1.5 pl-1.5 pr-2.5 text-sm text-label-neutral hover:bg-fill">
            <ChevronLeft className="size-[18px] opacity-60" />홈
          </Link>
          <div className="h-5 w-px bg-line" />
          <span className="size-2 shrink-0 rounded-full" style={{ background: CHANNEL_META[m.channel].color }} />
          <input
            value={m.headline.split("\n")[0]}
            onChange={(e) => updateMetadata({ headline: [e.target.value, ...m.headline.split("\n").slice(1)].join("\n") })}
            disabled={readOnly}
            aria-label="헤드라인"
            className="w-[300px] rounded-lg bg-transparent px-2 py-1.5 text-[15px] font-semibold tracking-[-0.01em] text-label outline-none hover:bg-fill-alt focus:bg-fill disabled:hover:bg-transparent"
          />
          <StageBadge status={m.status} touched={touched} />
          <span className="whitespace-nowrap text-[13px] text-label-assistive">{saveLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 pr-1">
            <GhostIcon title="되돌리기 (⌘Z)" onClick={undo} disabled={!canUndo}><Undo2 className="size-[17px] opacity-70" /></GhostIcon>
            <GhostIcon title="다시하기 (⇧⌘Z)" onClick={redo} disabled={!canRedo}><Redo2 className="size-[17px] opacity-70" /></GhostIcon>
          </div>
          <button type="button" onClick={() => setMode(isPreview ? "edit" : "preview")} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-label-neutral hover:bg-fill">
            <Eye className="size-[18px] opacity-60" />
            {isPreview ? "편집" : "미리보기"}
          </button>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            disabled={readOnly && m.status === "publishing"}
            className="h-10 min-w-[86px] rounded-[10px] bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-50"
          >
            {m.status === "published" ? "게시 정보" : "게시"}
          </button>
        </div>
      </header>

      {saveState === "failed" && (
        <div className="flex shrink-0 items-center justify-center gap-2.5 bg-negative px-4 py-[7px] text-[13px] font-medium text-white">
          <span>Drive 저장 실패</span>
          <span className="opacity-60">·</span>
          <span className="max-w-[60ch] truncate opacity-90">{saveError}</span>
          <button type="button" onClick={() => void saveNow()} className="rounded-full px-2.5 py-[3px] text-[13px] font-semibold" style={{ background: "rgba(255,255,255,0.22)" }}>
            다시 시도
          </button>
          <button type="button" onClick={() => router.refresh()} className="rounded-full px-2.5 py-[3px] text-[13px] font-semibold opacity-80 hover:opacity-100">
            새로고침
          </button>
        </div>
      )}
      {readOnly && (
        <div className="flex shrink-0 items-center justify-center gap-2.5 px-4 py-[9px] text-[13px] font-semibold" style={{ background: "var(--semantic-background-status-positive)", color: "var(--semantic-accent-foreground-green)" }}>
          <span>{m.status === "publishing" ? "게시 중이에요" : "게시된 포스트예요"}</span>
          <span className="opacity-40">·</span>
          <Link href={`/publish/${encodeURIComponent(postId)}`} className="text-brand hover:text-brand-strong">게시 기록 보기</Link>
        </div>
      )}

      {isPreview ? (
        <PreviewMode bundle={bundle} snapshot={snap} assetUrl={assetUrl} onBack={() => setMode("edit")} />
      ) : (
        <>
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <LeftPanel tab={leftTab} onTab={setLeftTab} slide={selected} state={selectedState} bundle={bundle} disabled={readOnly} />
            <StageArea
              slide={selected}
              state={selectedState}
              imageUrl={assetUrl(selected?.asset)}
              readOnly={readOnly}
              slideIndex={selected ? m.slides.findIndex((s) => s.id === selected.id) : 0}
              slideCount={m.slides.length}
              onPrev={() => {
                const i = m.slides.findIndex((s) => s.id === selected?.id);
                if (i > 0) select(m.slides[i - 1].id);
              }}
              onNext={() => {
                const i = m.slides.findIndex((s) => s.id === selected?.id);
                if (i < m.slides.length - 1) select(m.slides[i + 1].id);
              }}
              selection={selection}
              resolveAsset={assetUrl}
              selectedLayer={selectedLayer}
            />
            <RightPanel slide={selected} state={selectedState} bundle={bundle} disabled={readOnly} onDownload={async () => {
              try {
                const blobs = await renderAll();
                const { downloadBlob } = await import("@/lib/render/export");
                blobs.forEach((b, i) => downloadBlob(b, `${postId}_slide_${String(i + 1).padStart(2, "0")}.jpg`));
                toast.success(`${blobs.length}장 내려받았어요`);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : String(e));
                setExportSlide(null);
              }
            }} />
          </div>
          <SlideStrip bundle={bundle} disabled={readOnly} />
        </>
      )}

      {/* 내보내기용 숨은 스테이지 (540px 표시 → pixelRatio 2 로 1080×H) */}
      <div className="pointer-events-none absolute -left-[9999px] top-0" aria-hidden>
        {exportingSlide && exportingState && (
          <SlideCanvas ref={hiddenStageRef} slideState={exportingState} text={exportingSlide.text} imageUrl={assetUrl(exportingSlide.asset)} displayWidth={540} canvasHeight={snap.editorState.canvas.height} resolveAsset={assetUrl} />
        )}
      </div>

      <PublishSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        snapshot={snap}
        prepare={saveAndRender}
        onDone={(next) => {
          setSheetOpen(false);
          if (next === "home") router.push(`/home?ch=${m.channel}`);
        }}
      />
      <div className={cn("pointer-events-none fixed inset-0 z-30", exportSlide && "pointer-events-auto")} aria-hidden />
    </div>
  );
}

/** 스테이지 안 Konva.Image 노드들의 image 가 로드될 때까지 대기 */
async function waitForImages(stage: Konva.Stage | null, timeoutMs = 4000): Promise<void> {
  if (!stage) return;
  const start = Date.now();
  for (;;) {
    const imgs = stage.find("Image");
    const pending = imgs.filter((n) => {
      const img = (n as Konva.Image).image() as HTMLImageElement | undefined;
      return img && !(img.complete && img.naturalWidth > 0);
    });
    if (pending.length === 0) return;
    if (Date.now() - start > timeoutMs) return;
    await new Promise((r) => setTimeout(r, 60));
  }
}
