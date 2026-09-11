"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Konva from "konva";
import { toast } from "sonner";
import { ArrowLeft, Download, Eye, Grid3x3, Redo2, Save, Send, Undo2 } from "lucide-react";
import { useEditorStore, selectSelectedSlide } from "@/stores/editor-store";
import { usePost, useSavePost, useStylePacks, useSystemStatus } from "@/lib/client/queries";
import { api, ApiClientError, driveFileUrl } from "@/lib/client/api";
import { downloadBlob, exportStageToBlob } from "@/lib/render/export";
import { CHANNEL_DEFAULT_STYLE_PACK } from "@/presets";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/library/status-badge";
import { CHANNEL_META } from "@/lib/client/channel";
import { SlideCanvas } from "./canvas";
import { SlideStrip } from "./slide-strip";
import { CaptionPanel, ImagePanel, PresetPicker, SourcesPanel, TextPanel } from "./panels";
import { FeedPreview } from "@/components/preview/feed-preview";
import { cn } from "@/lib/utils";

export function EditorInner({ postId }: { postId: string }) {
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
  const updateSlideState = useEditorStore((s) => s.updateSlideState);

  const stageRef = useRef<Konva.Stage>(null);
  const hiddenStageRef = useRef<Konva.Stage>(null);
  const [exportSlide, setExportSlide] = useState<string | null>(null);
  const [showSafe, setShowSafe] = useState(false);
  const [preview, setPreview] = useState(false);
  const canvasHost = useRef<HTMLDivElement>(null);
  const [displayWidth, setDisplayWidth] = useState(480);

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

  // 캔버스 크기 반응형
  useEffect(() => {
    const el = canvasHost.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = e.contentRect.width - 32;
      const h = e.contentRect.height - 32;
      setDisplayWidth(Math.max(240, Math.floor(Math.min(w, (h * 1080) / 1350))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 이탈 경고
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const assetUrl = useCallback(
    (name: string | null | undefined) => {
      if (!name || !post.data) return null;
      const a = post.data.assets.find((x) => x.name === name);
      return a ? driveFileUrl(a.fileId) : null;
    },
    [post.data],
  );

  /** 모든 슬라이드를 숨은 스테이지에서 순서대로 렌더해 JPEG Blob 배열로 */
  const renderAll = async (): Promise<Blob[]> => {
    if (!snap) return [];
    const blobs: Blob[] = [];
    for (const s of snap.metadata.slides) {
      setExportSlide(s.id);
      await new Promise((r) => setTimeout(r, 120)); // 이미지·필터 캐시 반영 대기
      await waitForImages(hiddenStageRef.current);
      const stage = hiddenStageRef.current;
      if (!stage) throw new Error("export stage missing");
      blobs.push(await exportStageToBlob(stage));
    }
    setExportSlide(null);
    return blobs;
  };

  const handleSave = async () => {
    if (!snap || !post.data || save.isPending) return;
    try {
      const saved = await save.mutateAsync({
        expected_updated_at: snap.metadata.updated_at,
        metadata: {
          headline: snap.metadata.headline,
          topic: snap.metadata.topic,
          caption: snap.metadata.caption,
          hashtags: snap.metadata.hashtags,
          alt_text: snap.metadata.alt_text,
          content_type: snap.metadata.content_type,
          slides: snap.metadata.slides,
        },
        editorState: snap.editorState,
        sources: snap.sources,
      });
      markSaved(saved);
      toast.message("저장됨 · 렌더 생성 중…");
      const blobs = await renderAll();
      const withRenders = await api.uploadRenders(postId, blobs);
      markSaved(withRenders);
      toast.success(`저장 완료 · 렌더 ${blobs.length}장`);
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 409) {
        toast.error("다른 곳에서 먼저 저장됐습니다. 새로고침 후 다시 시도하세요.");
      } else toast.error(e instanceof Error ? e.message : String(e));
      setExportSlide(null);
    }
  };

  const handleDownload = async () => {
    if (!snap) return;
    try {
      const blobs = await renderAll();
      blobs.forEach((b, i) => downloadBlob(b, `${postId}_slide_${String(i + 1).padStart(2, "0")}.jpg`));
      toast.success(`${blobs.length}장 다운로드`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setExportSlide(null);
    }
  };

  // 단축키 (최신 handleSave 를 ref 로 참조)
  const handleSaveRef = useRef(handleSave);
  useEffect(() => {
    handleSaveRef.current = handleSave;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); redo(); }
      else if (e.key === "s") { e.preventDefault(); void handleSaveRef.current(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);


  if (post.isError) {
    return <div className="p-8 text-sm text-red-600">포스트를 불러올 수 없습니다: {String(post.error)}</div>;
  }
  if (!post.data || !snap || loadedId !== postId) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">불러오는 중…</div>;
  }

  const bundle = post.data;
  const m = snap.metadata;
  const selectedState = selected ? snap.editorState.slides[selected.id] : null;
  const exportingSlide = exportSlide ? m.slides.find((s) => s.id === exportSlide) : null;
  const exportingState = exportingSlide ? snap.editorState.slides[exportingSlide.id] : null;
  const busy = save.isPending || exportSlide !== null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <Button asChild variant="ghost" size="icon-sm">
          <Link href="/library"><ArrowLeft className="size-4" /></Link>
        </Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold" style={{ color: CHANNEL_META[m.channel].color }}>{m.channel}</span>
            <span className="truncate text-sm font-semibold">{m.headline.split("\n")[0] || m.post_id}</span>
            <StatusBadge status={m.status} />
            {dirty && <span className="text-[11px] text-amber-600">● 저장되지 않음</span>}
          </div>
          <div className="font-mono text-[11px] text-muted-foreground">{m.post_id} · {m.slides.length}장 · 렌더 {bundle.renders.length}장</div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <IconButton tip="실행 취소 (⌘Z)" onClick={undo} disabled={!canUndo}><Undo2 className="size-4" /></IconButton>
          <IconButton tip="다시 실행 (⇧⌘Z)" onClick={redo} disabled={!canRedo}><Redo2 className="size-4" /></IconButton>
          <IconButton tip="안전 영역" onClick={() => setShowSafe((v) => !v)} active={showSafe}><Grid3x3 className="size-4" /></IconButton>
          <IconButton tip="피드 미리보기" onClick={() => setPreview((v) => !v)} active={preview}><Eye className="size-4" /></IconButton>
          <div className="mx-1 h-6 w-px bg-border" />
          <Button variant="outline" size="sm" onClick={handleDownload} disabled={busy}>
            <Download className="size-3.5" /> JPEG
          </Button>
          <Button size="sm" onClick={handleSave} disabled={busy}>
            <Save className="size-3.5" /> {busy ? "저장 중…" : "저장 + 렌더"}
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href={`/publish/${encodeURIComponent(postId)}`}><Send className="size-3.5" /> 게시</Link>
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={canvasHost} className="relative flex flex-1 items-center justify-center overflow-hidden bg-neutral-100 p-4 dark:bg-neutral-900">
            {preview ? (
              <FeedPreview bundle={bundle} snapshot={snap} assetUrl={assetUrl} />
            ) : selected && selectedState ? (
              <div className="shadow-2xl" style={{ width: displayWidth }}>
                <SlideCanvas
                  ref={stageRef}
                  slideState={selectedState}
                  text={selected.text}
                  imageUrl={assetUrl(selected.asset)}
                  displayWidth={displayWidth}
                  editable
                  showSafeArea={showSafe}
                  onTextChange={(patch) => updateSlideState(selected.id, (s) => Object.assign(s.text, patch))}
                  onImageChange={(patch) => updateSlideState(selected.id, (s) => Object.assign(s.image, patch))}
                />
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">슬라이드를 추가하세요</div>
            )}
            {/* 내보내기용 숨은 스테이지 (540px 표시 → pixelRatio 2 로 1080×1350) */}
            <div className="pointer-events-none absolute -left-[9999px] top-0" aria-hidden>
              {exportingSlide && exportingState && (
                <SlideCanvas ref={hiddenStageRef} slideState={exportingState} text={exportingSlide.text} imageUrl={assetUrl(exportingSlide.asset)} displayWidth={540} />
              )}
            </div>
          </div>
          <SlideStrip bundle={bundle} />
        </div>

        <aside className="w-80 shrink-0 overflow-y-auto border-l border-border">
          <Tabs defaultValue="design">
            <TabsList className="sticky top-0 z-10 w-full rounded-none border-b border-border bg-background">
              <TabsTrigger value="design" className="flex-1 text-xs">디자인</TabsTrigger>
              <TabsTrigger value="copy" className="flex-1 text-xs">카피</TabsTrigger>
              <TabsTrigger value="sources" className="flex-1 text-xs">출처</TabsTrigger>
            </TabsList>
            <TabsContent value="design" className="mt-0">
              {selected && selectedState ? (
                <>
                  <PresetPicker slide={selected} />
                  <TextPanel slide={selected} state={selectedState} />
                  <ImagePanel slide={selected} state={selectedState} bundle={bundle} />
                </>
              ) : (
                <p className="p-4 text-xs text-muted-foreground">슬라이드를 선택하세요.</p>
              )}
            </TabsContent>
            <TabsContent value="copy" className="mt-0"><CaptionPanel /></TabsContent>
            <TabsContent value="sources" className="mt-0"><SourcesPanel /></TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}

function IconButton({ children, tip, onClick, disabled, active }: { children: React.ReactNode; tip: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" onClick={onClick} disabled={disabled} className={cn(active && "bg-accent")}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
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
