import { describe, expect, it } from "vitest";
import { PostMetadataSchema, EditorStateSchema, SourcesFileSchema, StylePackSchema, ChannelConfigSchema } from "@/types";
import { LAYOUT_PRESETS, BUILTIN_STYLE_PACKS, getPreset, resolvePreset, defaultPresetForRole } from "@/presets";

describe("PostMetadata schema", () => {
  it("fills defaults", () => {
    const m = PostMetadataSchema.parse({ post_id: "2026-09-11_x", channel: "LIFE", created_at: "a", updated_at: "b" });
    expect(m.status).toBe("draft");
    expect(m.slides).toEqual([]);
    expect(m.content_type).toBe("carousel");
    expect(m.fact_check_required).toBe(false);
  });
  it("rejects unknown status", () => {
    expect(() => PostMetadataSchema.parse({ post_id: "x", channel: "LIFE", status: "nope", created_at: "a", updated_at: "b" })).toThrow();
  });
  it("slide defaults", () => {
    const m = PostMetadataSchema.parse({ post_id: "x", channel: "AI", slides: [{ id: "s1" }], created_at: "a", updated_at: "b" });
    expect(m.slides[0].role).toBe("info");
    expect(m.slides[0].style_preset).toBe("info-dark");
    expect(m.slides[0].asset).toBeNull();
  });
});

describe("EditorState schema", () => {
  it("defaults to 1080x1350", () => {
    const s = EditorStateSchema.parse({});
    expect(s.canvas).toEqual({ width: 1080, height: 1350 });
    expect(s.slides).toEqual({});
  });
  it("fills nested slide defaults", () => {
    const s = EditorStateSchema.parse({ slides: { s1: {} } });
    expect(s.slides.s1.text.fontSize).toBe(72);
    expect(s.slides.s1.image.zoom).toBe(1);
    // 기존 editor-state.json(레이어 없음)도 그대로 읽힌다
    expect(s.slides.s1.layers).toEqual([]);
  });
  it("layer defaults + validation", () => {
    const s = EditorStateSchema.parse({ slides: { s1: { layers: [{ id: "l1", kind: "sticker", key: "tape" }] } } });
    const l = s.slides.s1.layers[0];
    expect(l.x).toBe(540);
    expect(l.width).toBe(300);
    expect(l.opacity).toBe(1);
    expect(l.height).toBeUndefined();
    expect(() => EditorStateSchema.parse({ slides: { s1: { layers: [{ id: "l1", kind: "blob", key: "x" }] } } })).toThrow();
  });
});

describe("Sources / Channel / StylePack", () => {
  it("sources default pending", () => {
    expect(SourcesFileSchema.parse({}).fact_check_status).toBe("pending");
  });
  it("channel config defaults", () => {
    const c = ChannelConfigSchema.parse({ key: "LIFE", name: "Life" });
    expect(c.editorial_rules.fact_check_required).toBe(false);
    expect(c.default_presets_by_role).toEqual({});
  });
  it("style pack id must be kebab", () => {
    expect(() => StylePackSchema.parse({ id: "Bad Id", name: "x" })).toThrow();
    expect(StylePackSchema.parse({ id: "ok-id", name: "x" }).palette.background).toBe("#0a0a0a");
  });
});

describe("presets", () => {
  it("loads exactly 10 layout presets", () => {
    expect(LAYOUT_PRESETS).toHaveLength(10);
    expect(new Set(LAYOUT_PRESETS.map((p) => p.id)).size).toBe(10);
  });
  it("loads 4 builtin style packs", () => {
    expect(BUILTIN_STYLE_PACKS).toHaveLength(4);
  });
  it("resolvePreset merges style pack overrides", () => {
    const mind = BUILTIN_STYLE_PACKS.find((s) => s.id === "mind-soft-paper")!;
    const p = resolvePreset("cover-center", undefined, mind);
    expect(p.toneDefaults.fontFamily).toBe("serif");
    expect(getPreset("cover-center").toneDefaults.fontFamily).toBe("sans");
  });
  it("defaultPresetForRole prefers channel override > style pack > role default", () => {
    const life = BUILTIN_STYLE_PACKS[0];
    expect(defaultPresetForRole("info", life, { info: "info-light" })).toBe("info-light");
    expect(defaultPresetForRole("info", life)).toBe("info-dark");
    expect(defaultPresetForRole("closing", null)).toBe("closing-slide");
  });
});
