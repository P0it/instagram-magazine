"use client";

import { create } from "zustand";
import { produce } from "immer";
import {
  EditorStateSchema,
  type EditorState,
  type PostBundle,
  type PostMetadata,
  type PresetId,
  type SlideDef,
  type SlideEditorState,
  type SlideRole,
  type SourcesFile,
  type StylePack,
} from "@/types";
import { ROLE_DEFAULT_PRESET, resolvePreset } from "@/presets";
import { applyPresetToState, slideStateFromPreset } from "@/lib/render/layout";

export interface EditorSnapshot {
  metadata: PostMetadata;
  editorState: EditorState;
  sources: SourcesFile;
}

interface EditorStore {
  postId: string | null;
  bundle: PostBundle | null;
  stylePack: StylePack | null;
  snapshot: EditorSnapshot | null;
  past: EditorSnapshot[];
  future: EditorSnapshot[];
  selectedSlideId: string | null;
  dirty: boolean;

  load: (bundle: PostBundle, stylePack: StylePack | null) => void;
  markSaved: (bundle: PostBundle) => void;
  select: (slideId: string) => void;

  undo: () => void;
  redo: () => void;

  updateMetadata: (patch: Partial<Pick<PostMetadata, "headline" | "topic" | "caption" | "hashtags" | "alt_text" | "content_type">>) => void;
  updateSlideText: (slideId: string, text: string) => void;
  updateSlideRole: (slideId: string, role: SlideRole) => void;
  setSlideAsset: (slideId: string, asset: string | null) => void;
  applyPreset: (slideId: string, presetId: PresetId) => void;
  updateSlideState: (slideId: string, fn: (s: SlideEditorState) => void) => void;
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
  return snap.editorState.slides[slide.id] ?? slideStateFromPreset(resolvePreset(slide.style_preset, slide.overrides, stylePack), slide.text);
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  postId: null,
  bundle: null,
  stylePack: null,
  snapshot: null,
  past: [],
  future: [],
  selectedSlideId: null,
  dirty: false,

  load: (bundle, stylePack) => {
    const editorState = EditorStateSchema.parse(bundle.editorState);
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
      dirty: false,
    });
  },

  markSaved: (bundle) => {
    const s = get();
    if (!s.snapshot) return;
    set({
      bundle,
      snapshot: { ...s.snapshot, metadata: { ...s.snapshot.metadata, updated_at: bundle.metadata.updated_at, status: bundle.metadata.status } },
      dirty: false,
    });
  },

  select: (slideId) => set({ selectedSlideId: slideId }),

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

  applyPreset: (slideId, presetId) => {
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
          );
        }),
      ),
    );
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
          d.editorState.slides[id] = slideStateFromPreset(resolvePreset(presetId, undefined, s.stylePack), "");
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
