"use client";

import { useRef, useState } from "react";
import { Lock, Unlock, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { LAYOUT_PRESETS } from "@/presets";
import { SlideRoleSchema, type PostBundle, type PresetId, type SlideDef, type SlideEditorState, type SlideRole } from "@/types";
import { useEditorStore } from "@/stores/editor-store";
import { api, driveFileUrl } from "@/lib/client/api";
import { useInvalidatePosts } from "@/lib/client/queries";
import { CAPTION_MAX, HASHTAG_MAX } from "@/lib/metadata/approval-gate";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<SlideRole, string> = {
  cover: "커버",
  photo: "사진",
  info: "정보",
  quote: "인용",
  screenshot: "스크린샷",
  closing: "클로징",
};

// ---------------- Preset picker ----------------
export function PresetPicker({ slide }: { slide: SlideDef }) {
  const applyPreset = useEditorStore((s) => s.applyPreset);
  const updateSlideRole = useEditorStore((s) => s.updateSlideRole);
  return (
    <Section title="레이아웃 프리셋">
      <div className="mb-2 flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">역할</Label>
        <Select value={slide.role} onValueChange={(v) => updateSlideRole(slide.id, SlideRoleSchema.parse(v))}>
          <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SlideRoleSchema.options.map((r) => (
              <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {LAYOUT_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => applyPreset(slide.id, p.id as PresetId)}
            title={p.description}
            className={cn(
              "flex flex-col items-start gap-1 rounded-lg border p-2 text-left transition-colors",
              slide.style_preset === p.id ? "border-foreground bg-accent" : "border-border hover:bg-accent/50",
            )}
          >
            <PresetThumb placement={p.textPlacement} dark={p.toneDefaults.background !== "#f5f2ea"} />
            <span className="text-[11px] font-medium leading-tight">{p.name}</span>
          </button>
        ))}
      </div>
    </Section>
  );
}

function PresetThumb({ placement, dark }: { placement: string; dark: boolean }) {
  const pos: Record<string, string> = {
    "top-left": "items-start justify-start",
    "top-center": "items-start justify-center",
    center: "items-center justify-center",
    "bottom-left": "items-end justify-start",
    "bottom-center": "items-end justify-center",
    "lower-third": "items-end justify-start pb-3",
  };
  return (
    <div className={cn("flex aspect-[4/5] w-full rounded-md p-1.5", dark ? "bg-neutral-800" : "bg-[#f5f2ea]", pos[placement] ?? "")}>
      <div className="flex w-3/4 flex-col gap-0.5">
        <div className={cn("h-1 w-full rounded-sm", dark ? "bg-white/80" : "bg-neutral-800")} />
        <div className={cn("h-1 w-2/3 rounded-sm", dark ? "bg-white/60" : "bg-neutral-700")} />
      </div>
    </div>
  );
}

// ---------------- Text panel ----------------
export function TextPanel({ slide, state }: { slide: SlideDef; state: SlideEditorState }) {
  const updateSlideText = useEditorStore((s) => s.updateSlideText);
  const updateSlideState = useEditorStore((s) => s.updateSlideState);
  const t = state.text;
  const set = (patch: Partial<SlideEditorState["text"]>) => updateSlideState(slide.id, (s) => Object.assign(s.text, patch));
  return (
    <Section
      title="텍스트"
      right={
        <button type="button" onClick={() => set({ locked: !t.locked })} className="text-muted-foreground hover:text-foreground" title={t.locked ? "잠금 해제" : "위치 잠금"}>
          {t.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
        </button>
      }
    >
      <Textarea value={slide.text} onChange={(e) => updateSlideText(slide.id, e.target.value)} rows={4} className="resize-none text-sm" placeholder="슬라이드 텍스트" />
      <Row label={`크기 ${t.fontSize}`}>
        <Slider min={20} max={200} step={1} value={[t.fontSize]} onValueChange={([v]) => set({ fontSize: v })} />
      </Row>
      <Row label={`행간 ${t.lineHeight.toFixed(2)}`}>
        <Slider min={0.9} max={2} step={0.05} value={[t.lineHeight]} onValueChange={([v]) => set({ lineHeight: v })} />
      </Row>
      <Row label={`자간 ${t.letterSpacing}`}>
        <Slider min={-6} max={10} step={0.5} value={[t.letterSpacing]} onValueChange={([v]) => set({ letterSpacing: v })} />
      </Row>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-[11px] text-muted-foreground">서체</Label>
          <Select value={t.fontFamily} onValueChange={(v) => set({ fontFamily: v as "sans" | "serif" })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sans">산세리프</SelectItem>
              <SelectItem value="serif">세리프</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">굵기</Label>
          <Select value={String(t.weight)} onValueChange={(v) => set({ weight: Number(v) })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[400, 500, 600, 700, 900].map((w) => (
                <SelectItem key={w} value={String(w)}>{w}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">정렬</Label>
          <Select value={t.align} onValueChange={(v) => set({ align: v as "left" | "center" | "right" })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="left">왼쪽</SelectItem>
              <SelectItem value="center">중앙</SelectItem>
              <SelectItem value="right">오른쪽</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-[11px] text-muted-foreground">색</Label>
        <input type="color" value={t.color} onChange={(e) => set({ color: e.target.value })} className="size-7 cursor-pointer rounded border border-border bg-transparent" />
        <Label className="ml-auto text-[11px] text-muted-foreground">프레임</Label>
        <Switch checked={t.frame} onCheckedChange={(v) => set({ frame: v })} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <NumField label="X" value={t.x} onChange={(v) => set({ x: v })} />
        <NumField label="Y" value={t.y} onChange={(v) => set({ y: v })} />
        <NumField label="W" value={t.width} onChange={(v) => set({ width: v })} />
      </div>
    </Section>
  );
}

// ---------------- Image panel ----------------
export function ImagePanel({ slide, state, bundle }: { slide: SlideDef; state: SlideEditorState; bundle: PostBundle }) {
  const updateSlideState = useEditorStore((s) => s.updateSlideState);
  const setSlideAsset = useEditorStore((s) => s.setSlideAsset);
  const invalidate = useInvalidatePosts();
  const fileRef = useRef<HTMLInputElement>(null);
  const im = state.image;
  const set = (fn: (i: SlideEditorState["image"]) => void) => updateSlideState(slide.id, (s) => fn(s.image));

  async function upload(file: File) {
    try {
      const res = await api.uploadAsset(bundle.metadata.post_id, file, slide.id);
      setSlideAsset(slide.id, res.uploaded);
      invalidate(bundle.metadata.post_id);
      toast.success(`업로드: ${res.uploaded}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Section title="이미지">
      <div className="flex flex-wrap gap-1.5">
        {bundle.assets.map((a) => (
          <button
            key={a.fileId}
            type="button"
            onClick={() => setSlideAsset(slide.id, a.name)}
            className={cn("relative size-14 overflow-hidden rounded-md border", slide.asset === a.name ? "border-foreground ring-2 ring-foreground/20" : "border-border")}
            title={a.name}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={driveFileUrl(a.fileId)} alt="" className="size-full object-cover" />
          </button>
        ))}
        <button type="button" onClick={() => fileRef.current?.click()} className="flex size-14 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:text-foreground" title="이미지 업로드">
          <Upload className="size-4" />
        </button>
        {slide.asset && (
          <button type="button" onClick={() => setSlideAsset(slide.id, null)} className="flex size-14 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground" title="이미지 제거 (텍스트만)">
            <X className="size-4" />
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>
      <Row label={`줌 ${im.zoom.toFixed(2)}`}><Slider min={1} max={3} step={0.01} value={[im.zoom]} onValueChange={([v]) => set((i) => { i.zoom = v; })} /></Row>
      <Row label={`밝기 ${im.brightness.toFixed(2)}`}><Slider min={-0.6} max={0.6} step={0.01} value={[im.brightness]} onValueChange={([v]) => set((i) => { i.brightness = v; })} /></Row>
      <Row label={`대비 ${im.contrast}`}><Slider min={-60} max={60} step={1} value={[im.contrast]} onValueChange={([v]) => set((i) => { i.contrast = v; })} /></Row>
      <Row label={`채도 ${im.saturation.toFixed(2)}`}><Slider min={-1} max={1} step={0.05} value={[im.saturation]} onValueChange={([v]) => set((i) => { i.saturation = v; })} /></Row>
      <Row label={`블러 ${im.blur}`}><Slider min={0} max={30} step={1} value={[im.blur]} onValueChange={([v]) => set((i) => { i.blur = v; })} /></Row>
      <Row label={`오버레이 ${Math.round(im.overlay.opacity * 100)}%`}>
        <div className="flex items-center gap-2">
          <input type="color" value={im.overlay.color} onChange={(e) => set((i) => { i.overlay.color = e.target.value; })} className="size-6 shrink-0 cursor-pointer rounded border border-border bg-transparent" />
          <Slider min={0} max={1} step={0.01} value={[im.overlay.opacity]} onValueChange={([v]) => set((i) => { i.overlay.opacity = v; })} />
        </div>
      </Row>
      <Row label={`그라디언트 ${Math.round(im.gradient.opacity * 100)}%`}>
        <div className="flex items-center gap-2">
          <Select value={im.gradient.direction} onValueChange={(v) => set((i) => { i.gradient.direction = v as typeof i.gradient.direction; })}>
            <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">없음</SelectItem>
              <SelectItem value="bottom">아래</SelectItem>
              <SelectItem value="top">위</SelectItem>
              <SelectItem value="full">전체</SelectItem>
            </SelectContent>
          </Select>
          <Slider min={0} max={1} step={0.01} value={[im.gradient.opacity]} onValueChange={([v]) => set((i) => { i.gradient.opacity = v; })} />
        </div>
      </Row>
      <div className="flex items-center gap-2">
        <Label className="text-[11px] text-muted-foreground">배경</Label>
        <input type="color" value={im.background} onChange={(e) => set((i) => { i.background = e.target.value; })} className="size-7 cursor-pointer rounded border border-border bg-transparent" />
        <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={() => set((i) => { i.pan = { x: 0, y: 0 }; i.zoom = 1; })}>
          크롭 초기화
        </Button>
      </div>
    </Section>
  );
}

// ---------------- Caption panel ----------------
export function CaptionPanel() {
  const snap = useEditorStore((s) => s.snapshot);
  const updateMetadata = useEditorStore((s) => s.updateMetadata);
  if (!snap) return null;
  const m = snap.metadata;
  const total = m.caption.length + m.hashtags.reduce((n, h) => n + h.length + 2, 0);
  return (
    <Section title="헤드라인 · 캡션">
      <div>
        <Label className="text-[11px] text-muted-foreground">헤드라인 (카드 표시용)</Label>
        <Textarea value={m.headline} onChange={(e) => updateMetadata({ headline: e.target.value })} rows={2} className="resize-none text-sm" />
      </div>
      <div>
        <Label className="text-[11px] text-muted-foreground">주제</Label>
        <Input value={m.topic} onChange={(e) => updateMetadata({ topic: e.target.value })} className="h-8 text-sm" />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <Label className="text-[11px] text-muted-foreground">캡션</Label>
          <span className={cn("text-[11px] tabular-nums", total > CAPTION_MAX ? "text-red-500" : "text-muted-foreground")}>{total} / {CAPTION_MAX}</span>
        </div>
        <Textarea value={m.caption} onChange={(e) => updateMetadata({ caption: e.target.value })} rows={7} className="text-sm" />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <Label className="text-[11px] text-muted-foreground">해시태그 (쉼표·공백 구분)</Label>
          <span className={cn("text-[11px] tabular-nums", m.hashtags.length > HASHTAG_MAX ? "text-red-500" : "text-muted-foreground")}>{m.hashtags.length} / {HASHTAG_MAX}</span>
        </div>
        <HashtagInput key={m.hashtags.join(" ")} value={m.hashtags} onChange={(hashtags) => updateMetadata({ hashtags })} />
      </div>
      <div>
        <Label className="text-[11px] text-muted-foreground">대체 텍스트 (선택)</Label>
        <Input value={m.alt_text ?? ""} onChange={(e) => updateMetadata({ alt_text: e.target.value || undefined })} className="h-8 text-sm" />
      </div>
    </Section>
  );
}

function HashtagInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState(value.join(" "));
  return (
    <Input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onChange(parseTags(draft))}
      onKeyDown={(e) => e.key === "Enter" && onChange(parseTags(draft))}
      className="h-8 font-mono text-xs"
      placeholder="청년정책 월세지원"
    />
  );
}

function parseTags(s: string): string[] {
  return [...new Set(s.split(/[\s,]+/).map((t) => t.replace(/^#/, "").trim()).filter(Boolean))];
}


// ---------------- Sources panel ----------------
export function SourcesPanel() {
  const snap = useEditorStore((s) => s.snapshot);
  const setFactCheck = useEditorStore((s) => s.setFactCheck);
  if (!snap) return null;
  const src = snap.sources;
  const required = snap.metadata.fact_check_required;
  return (
    <Section title={`출처 · 팩트체크${required ? " (필수)" : ""}`}>
      {src.items.length === 0 ? (
        <p className="text-xs text-muted-foreground">등록된 출처가 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {src.items.map((s, i) => (
            <li key={i} className="rounded-md border border-border p-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-muted px-1 py-0.5 text-[10px] uppercase text-muted-foreground">{s.source_type}</span>
                <span className="font-medium">{s.title || "(제목 없음)"}</span>
              </div>
              <div className="mt-0.5 truncate text-muted-foreground">{s.publisher}{s.url ? ` · ${s.url}` : ""}</div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Label className="text-[11px] text-muted-foreground">상태</Label>
        <Select value={src.fact_check_status} onValueChange={(v) => setFactCheck(v as typeof src.fact_check_status)}>
          <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">대기</SelectItem>
            <SelectItem value="approved">승인</SelectItem>
            <SelectItem value="rejected">반려</SelectItem>
          </SelectContent>
        </Select>
        {src.fact_checked_at && <span className="text-[11px] text-muted-foreground">{new Date(src.fact_checked_at).toLocaleString("ko-KR")}</span>}
      </div>
      <Textarea value={src.reviewer_note} onChange={(e) => setFactCheck(src.fact_check_status, e.target.value)} rows={2} placeholder="검토 메모" className="resize-none text-xs" />
    </Section>
  );
}

// ---------------- shared ----------------
export function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-border px-4 py-4 last:border-0">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
      <Label className="text-[11px] tabular-nums text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-7 px-1.5 text-xs tabular-nums" />
    </div>
  );
}
