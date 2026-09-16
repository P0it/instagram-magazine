"use client";

import { create } from "zustand";
import { produce } from "immer";
import {
  EditorStateSchema,
  type EditorState,
  formatDims,
  type CustomPreset,
  type PostBundle,
  type PostFormat,
  type PostMetadata,
  type PresetId,
  type SlideDef,
  type SlideEditorState,
  type SlideLayer,
  type SlideRole,
  type SourcesFile,
  type StylePack,
} from "@/types";
import { ROLE_DEFAULT_PRESET, resolvePreset } from "@/presets";
import { applyPresetToState, reflowSlideForHeight, slideStateFromPreset } from "@/lib/render/layout";

export interface EditorSnapshot {
  metadata: PostMetadata;
  editorState: EditorState;
  sources: SourcesFile;
}

/** 캔버스 선택 대상. null = 포스트(캡션·태그) 패널 */
export type Selection = { kind: "text" } | { kind: "image" } | { kind: "layer"; id: string } | null;

interface EditorStore {
  postId: string | null;
  bundle: PostBundle | null;
  stylePack: StylePack | null;
  snapshot: EditorSnapshot | null;
  past: EditorSnapshot[];
  future: EditorSnapshot[];
  selectedSlideId: string | null;
  selection: Selection;
  dirty: boolean;

  load: (bundle: PostBundle, stylePack: StylePack | null) => void;
  /** 저장 완료 반영. savedSnapshot 을 주면 그 뒤에 생긴 변경은 dirty 로 남긴다 (null 이면 항상 dirty 유지) */
  markSaved: (bundle: PostBundle, savedSnapshot?: EditorSnapshot | null) => void;
  select: (slideId: string) => void;
  setSelection: (sel: Selection) => void;

  undo: () => void;
  redo: () => void;

  updateMetadata: (patch: Partial<Pick<PostMetadata, "headline" | "topic" | "caption" | "hashtags" | "alt_text" | "content_type">>) => void;
  updateSlideText: (slideId: string, text: string) => void;
  updateSlideRole: (slideId: string, role: SlideRole) => void;
  setSlideAsset: (slideId: string, asset: string | null) => void;
  applyPreset: (slideId: string, presetId: PresetId, withImage?: boolean) => void;
  /** 내 프리셋(기본 프리셋 + 오버라이드) 적용 */
  applyCustomPreset: (slideId: string, preset: CustomPreset, withImage?: boolean) => void;
  /** 포스트 규격 전환 — 모든 슬라이드의 세로 좌표를 비례 이동 */
  setFormat: (format: PostFormat) => void;
  updateSlideState: (slideId: string, fn: (s: SlideEditorState) => void) => void;
  addLayer: (slideId: string, layer: Omit<SlideLayer, "id">) => string;
  updateLayer: (slideId: string, layerId: string, patch: Partial<SlideLayer>) => void;
  removeLayer: (slideId: string, layerId: string) => void;
  duplicateLayer: (slideId: string, layerId: string) => void;
  moveLayer: (slideId: string, layerId: string, dir: 1 | -1) => void;
  addSlide: (role?: SlideRole) => void;
  removeSlide: (slideId: string) => void;
  moveSlide: (from: number, to: number) => void;
  duplicateSlide: (slideId: string) => void;
  setFactCheck: (status: SourcesFile["fact_check_status"], note?: string) => void;
}

const MAX_HISTORY = 100;

function commit(state: EditorStore, next: EditorSnapshot): Partial<EditorStore> {
  const past = state.snapshot ? [...state.past, state.snapshot].slice(-MAX_HISTORY) : state.past;
  return { snapshot: next, past, future: [], dirty: true };
}

function ensureSlideState(snap: EditorSnapshot, slide: SlideDef, stylePack: StylePack | null): SlideEditorState {
  return snap.editorState.slides[slide.id] ?? slideStateFromPreset(resolvePreset(slide.style_preset, slide.overrides, stylePack), slide.text, snap.editorState.canvas.height);
}

const canvasH = (snap: EditorSnapshot | null): number => snap?.editorState.canvas.height ?? 1350;

export const useEditorStore = create<EditorStore>((set, get) => ({
  postId: null,
  bundle: null,
  stylePack: null,
  snapshot: null,
  past: [],
  future: [],
  selectedSlideId: null,
  selection: { kind: "text" },
  dirty: false,

  load: (bundle, stylePack) => {
    const editorState = EditorStateSchema.parse(bundle.editorState);
    // 캔버스 크기는 metadata.format 이 기준
    editorState.canvas = { ...editorState.canvas, height: formatDims(bundle.metadata.format).height };
    const snap: EditorSnapshot = { metadata: bundle.metadata, editorState, sources: bundle.sources };
    // 누락된 슬라이드 상태는 프리셋으로 채운다
    const filled = produce(snap, (d) => {
      for (const s of d.metadata.slides) {
        if (!d.editorState.slides[s.id]) d.editorState.slides[s.id] = ensureSlideState(snap, s, stylePack);
      }
    });
    set({
      postId: bundle.metadata.post_id,
      bundle,
      stylePack,
      snapshot: filled,
      past: [],
      future: [],
      selectedSlideId: bundle.metadata.slides[0]?.id ?? null,
      selection: { kind: "text" },
      dirty: false,
    });
  },

  markSaved: (bundle, savedSnapshot) => {
    const s = get();
    if (!s.snapshot) return;
    const stillDirty = savedSnapshot === undefined ? false : s.snapshot !== savedSnapshot;
    set({
      bundle,
      snapshot: { ...s.snapshot, metadata: { ...s.snapshot.metadata, updated_at: bundle.metadata.updated_at, status: bundle.metadata.status } },
      dirty: stillDirty,
    });
  },

  select: (slideId) => set({ selectedSlideId: slideId, selection: { kind: "text" } }),
  setSelection: (selection) => set({ selection }),

  undo: () => {
    const s = get();
    if (!s.snapshot || s.past.length === 0) return;
    const prev = s.past[s.past.length - 1];
    set({ snapshot: prev, past: s.past.slice(0, -1), future: [s.snapshot, ...s.future], dirty: true });
  },
  redo: () => {
    const s = get();
    if (!s.snapshot || s.future.length === 0) return;
    const [next, ...rest] = s.future;
    set({ snapshot: next, past: [...s.past, s.snapshot], future: rest, dirty: true });
  },

  updateMetadata: (patch) => {
    const s = get();
    if (!s.snapshot) return;
    set(
      commit(
        s,
        produce(s.snapshot, (d) => {
          Object.assign(d.metadata, patch);
        }),
      ),
    );
  },

  updateSlideText: (slideId, text) => {
    const s = get();
    if (!s.snapshot) return;
    set(
      commit(
        s,
        produce(s.snapshot, (d) => {
          const slide = d.metadata.slides.find((x) => x.id === slideId);
          if (slide) slide.text = text;
        }),
      ),
    );
  },

  updateSlideRole: (slideId, role) => {
    const s = get();
    if (!s.snapshot) return;
    set(
      commit(
        s,
        produce(s.snapshot, (d) => {
          const slide = d.metadata.slides.find((x) => x.id === slideId);
          if (!slide) return;
          slide.role = role;
          const presetId = s.stylePack?.presets_by_role[role] ?? ROLE_DEFAULT_PRESET[role];
          slide.style_preset = presetId;
          d.editorState.slides[slideId] = applyPresetToState(
            d.editorState.slides[slideId] ?? ensureSlideState(s.snapshot!, slide, s.stylePack),
            resolvePreset(presetId, undefined, s.stylePack),
            slide.text,
            true,
            canvasH(s.snapshot),
          );
        }),
      ),
    );
  },

  setSlideAsset: (slideId, asset) => {
    const s = get();
    if (!s.snapshot) return;
    set(
      commit(
        s,
        produce(s.snapshot, (d) => {
          const slide = d.metadata.slides.find((x) => x.id === slideId);
          if (slide) slide.asset = asset;
        }),
      ),
    );
  },

  applyPreset: (slideId, presetId, withImage = true) => {
    const s = get();
    if (!s.snapshot) return;
    set(
      commit(
        s,
        produce(s.snapshot, (d) => {
          const slide = d.metadata.slides.find((x) => x.id === slideId);
          if (!slide) return;
          slide.style_preset = presetId;
          slide.overrides = undefined;
          d.editorState.slides[slideId] = applyPresetToState(
            d.editorState.slides[slideId] ?? ensureSlideState(s.snapshot!, slide, s.stylePack),
            resolvePreset(presetId, undefined, s.stylePack),
            slide.text,
            withImage,
            canvasH(s.snapshot),
          );
        }),
      ),
    );
  },

  applyCustomPreset: (slideId, preset, withImage = true) => {
    const s = get();
    if (!s.snapshot) return;
    set(
      commit(
        s,
        produce(s.snapshot, (d) => {
          const slide = d.metadata.slides.find((x) => x.id === slideId);
          if (!slide) return;
          slide.style_preset = preset.base;
          slide.overrides = preset.overrides;
          d.editorState.slides[slideId] = applyPresetToState(
            d.editorState.slides[slideId] ?? ensureSlideState(s.snapshot!, slide, s.stylePack),
            resolvePreset(preset.base, preset.overrides, s.stylePack),
            slide.text,
            withImage,
            canvasH(s.snapshot),
          );
        }),
      ),
    );
  },

  setFormat: (format) => {
    const s = get();
    if (!s.snapshot || s.snapshot.metadata.format === format) return;
    const from = canvasH(s.snapshot);
    const to = formatDims(format).height;
    set(
      commit(
        s,
        produce(s.snapshot, (d) => {
          d.metadata.format = format;
          d.editorState.canvas = { width: 1080, height: to };
          for (const id of Object.keys(d.editorState.slides)) {
            d.editorState.slides[id] = reflowSlideForHeight(d.editorState.slides[id], from, to);
          }
        }),
      ),
    );
  },

  addLayer: (slideId, layer) => {
    const s = get();
    if (!s.snapshot) return "";
    const existing = s.snapshot.editorState.slides[slideId]?.layers ?? [];
    const ids = existing.map((l) => Number(l.id.replace(/^l/, "")) || 0);
    const id = `l${(ids.length ? Math.max(...ids) : 0) + 1}`;
    set({
      ...commit(
        s,
        produce(s.snapshot, (d) => {
          const slide = d.metadata.slides.find((x) => x.id === slideId);
          if (!slide) return;
          d.editorState.slides[slideId] ??= ensureSlideState(s.snapshot!, slide, s.stylePack);
          d.editorState.slides[slideId].layers.push({ ...layer, id });
        }),
      ),
      selection: { kind: "layer", id },
    });
    return id;
  },

  updateLayer: (slideId, layerId, patch) => {
    get().updateSlideState(slideId, (st) => {
      const l = st.layers.find((x) => x.id === layerId);
      if (l) Object.assign(l, patch);
    });
  },

  removeLayer: (slideId, layerId) => {
    const s = get();
    if (!s.snapshot) return;
    set({
      ...commit(
        s,
        produce(s.snapshot, (d) => {
          const st = d.editorState.slides[slideId];
          if (st) st.layers = st.layers.filter((l) => l.id !== layerId);
        }),
      ),
      selection: s.selection?.kind === "layer" && s.selection.id === layerId ? null : s.selection,
    });
  },

  duplicateLayer: (slideId, layerId) => {
    const s = get();
    const src = s.snapshot?.editorState.slides[slideId]?.layers.find((l) => l.id === layerId);
    if (!src) return;
    const { id: _id, ...rest } = src;
    void _id;
    s.addLayer(slideId, { ...rest, x: Math.min(1040, src.x + 60), y: Math.min(1310, src.y + 60) });
  },

  moveLayer: (slideId, layerId, dir) => {
    get().updateSlideState(slideId, (st) => {
      const i = st.layers.findIndex((l) => l.id === layerId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= st.layers.length) return;
      const a = st.layers[i];
      st.layers[i] = st.layers[j];
      st.layers[j] = a;
    });
  },

  updateSlideState: (slideId, fn) => {
    const s = get();
    if (!s.snapshot) return;
    set(
      commit(
        s,
        produce(s.snapshot, (d) => {
          const slide = d.metadata.slides.find((x) => x.id === slideId);
          if (!slide) return;
          d.editorState.slides[slideId] ??= ensureSlideState(s.snapshot!, slide, s.stylePack);
          fn(d.editorState.slides[slideId]);
        }),
      ),
    );
  },

  addSlide: (role = "info") => {
    const s = get();
    if (!s.snapshot) return;
    const ids = s.snapshot.metadata.slides.map((x) => Number(x.id.replace(/^s/, "")) || 0);
    const id = `s${(ids.length ? Math.max(...ids) : 0) + 1}`;
    const presetId = s.stylePack?.presets_by_role[role] ?? ROLE_DEFAULT_PRESET[role];
    const slide: SlideDef = { id, role, text: "", asset: null, style_preset: presetId };
    set({
      ...commit(
        s,
        produce(s.snapshot, (d) => {
          d.metadata.slides.push(slide);
          d.editorState.slides[id] = slideStateFromPreset(resolvePreset(presetId, undefined, s.stylePack), "", canvasH(s.snapshot));
          d.metadata.content_type = d.metadata.slides.length > 1 ? "carousel" : "single";
        }),
      ),
      selectedSlideId: id,
    });
  },

  removeSlide: (slideId) => {
    const s = get();
    if (!s.snapshot || s.snapshot.metadata.slides.length <= 1) return;
    const idx = s.snapshot.metadata.slides.findIndex((x) => x.id === slideId);
    const next = produce(s.snapshot, (d) => {
      d.metadata.slides = d.metadata.slides.filter((x) => x.id !== slideId);
      delete d.editorState.slides[slideId];
      d.metadata.content_type = d.metadata.slides.length > 1 ? "carousel" : "single";
    });
    const fallback = next.metadata.slides[Math.min(idx, next.metadata.slides.length - 1)]?.id ?? null;
    set({ ...commit(s, next), selectedSlideId: s.selectedSlideId === slideId ? fallback : s.selectedSlideId });
  },

  moveSlide: (from, to) => {
    const s = get();
    if (!s.snapshot) return;
    const n = s.snapshot.metadata.slides.length;
    if (from < 0 || from >= n || to < 0 || to >= n || from === to) return;
    set(
      commit(
        s,
        produce(s.snapshot, (d) => {
          const [item] = d.metadata.slides.splice(from, 1);
          d.metadata.slides.splice(to, 0, item);
        }),
      ),
    );
  },

  duplicateSlide: (slideId) => {
    const s = get();
    if (!s.snapshot) return;
    const idx = s.snapshot.metadata.slides.findIndex((x) => x.id === slideId);
    if (idx < 0) return;
    const ids = s.snapshot.metadata.slides.map((x) => Number(x.id.replace(/^s/, "")) || 0);
    const id = `s${Math.max(...ids) + 1}`;
    set({
      ...commit(
        s,
        produce(s.snapshot, (d) => {
          const src = d.metadata.slides[idx];
          d.metadata.slides.splice(idx + 1, 0, { ...src, id });
          const st = d.editorState.slides[slideId];
          if (st) d.editorState.slides[id] = JSON.parse(JSON.stringify(st)) as SlideEditorState;
          d.metadata.content_type = "carousel";
        }),
      ),
      selectedSlideId: id,
    });
  },

  setFactCheck: (status, note) => {
    const s = get();
    if (!s.snapshot) return;
    set(
      commit(
        s,
        produce(s.snapshot, (d) => {
          d.sources.fact_check_status = status;
          d.sources.fact_checked_at = status === "pending" ? null : new Date().toISOString();
          if (note !== undefined) d.sources.reviewer_note = note;
        }),
      ),
    );
  },
}));

export const selectSelectedSlide = (s: EditorStore): SlideDef | null =>
  s.snapshot?.metadata.slides.find((x) => x.id === s.selectedSlideId) ?? null;

export const selectSelectedLayer = (s: EditorStore): SlideLayer | null => {
  if (!s.snapshot || !s.selectedSlideId || s.selection?.kind !== "layer") return null;
  const id = s.selection.id;
  return s.snapshot.editorState.slides[s.selectedSlideId]?.layers.find((l) => l.id === id) ?? null;
};
