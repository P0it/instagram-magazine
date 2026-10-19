import { describe, expect, it } from "vitest";
import { EditorStateSchema, FORMAT_INFO, LayoutAnalysisSchema, POST_FORMATS, PostMetadataSchema, analysisToPreset, formatDims, formatOfDims } from "@/types";
import { evaluateApprovalGate } from "@/lib/metadata/approval-gate";
import { reflowSlideForHeight, slideStateFromPreset, textGeometryFromPreset } from "@/lib/render/layout";
import { getPreset } from "@/presets";
import { parseAnalysis } from "@/lib/ai/layout-analyst";
import { makeLayer } from "@/lib/render/layer-factory";

describe("포스트 규격", () => {
  it("네 규격 모두 폭 1080, 높이는 표대로", () => {
    expect(formatDims("4:5")).toEqual({ width: 1080, height: 1350 });
    expect(formatDims("3:4")).toEqual({ width: 1080, height: 1440 });
    expect(formatDims("1:1")).toEqual({ width: 1080, height: 1080 });
    expect(formatDims("1.91:1")).toEqual({ width: 1080, height: 566 });
    for (const f of POST_FORMATS) expect(formatOfDims(1080, FORMAT_INFO[f].height)).toBe(f);
    expect(formatOfDims(1080, 999)).toBeNull();
  });

  it("metadata.format 기본 4:5, 캔버스 높이는 규격 목록만 허용", () => {
    expect(PostMetadataSchema.parse({ post_id: "x", channel: "life.magazine", created_at: "a", updated_at: "b" }).format).toBe("4:5");
    expect(EditorStateSchema.parse({ canvas: { width: 1080, height: 1080 } }).canvas.height).toBe(1080);
    expect(() => EditorStateSchema.parse({ canvas: { width: 1080, height: 1000 } })).toThrow();
  });

  it("승인 게이트는 metadata.format 기준으로 렌더 크기를 본다", () => {
    const m = PostMetadataSchema.parse({ post_id: "x", channel: "ai.magazine", format: "1:1", headline: "h", slides: [{ id: "s1" }], created_at: "a", updated_at: "b" });
    const sources = { fact_check_status: "pending" as const, fact_checked_at: null, reviewer_note: "", items: [] };
    const ok = evaluateApprovalGate({ metadata: m, sources, renderDims: [{ width: 1080, height: 1080, format: "jpeg" }] });
    expect(ok.checks.find((c) => c.id === "render_dimensions")?.ok).toBe(true);
    const bad = evaluateApprovalGate({ metadata: m, sources, renderDims: [{ width: 1080, height: 1350, format: "jpeg" }] });
    expect(bad.checks.find((c) => c.id === "render_dimensions")?.ok).toBe(false);
  });

  it("프리셋 배치는 캔버스 높이를 따른다", () => {
    const p = getPreset("cover-bottom");
    const tall = textGeometryFromPreset(p, "a\nb", 1440);
    const square = textGeometryFromPreset(p, "a\nb", 1080);
    expect(tall.y).toBeGreaterThan(square.y);
    expect(square.y + 60).toBeLessThanOrEqual(1080);
  });

  it("규격 전환 시 세로 좌표를 비례 이동하고 캔버스 안으로 클램프", () => {
    const st = slideStateFromPreset(getPreset("cover-bottom"), "x", 1350);
    st.layers.push({ id: "l1", ...makeLayer({ kind: "sticker", key: "tape", x: 540, y: 1300, color: "#fff" }) });
    const out = reflowSlideForHeight(st, 1350, 566);
    expect(out.text.y).toBeLessThanOrEqual(566 - 60);
    expect(out.layers[0].y).toBeLessThanOrEqual(566);
    expect(out.image).toBe(st.image);
  });
});

describe("스크린샷 → 프리셋", () => {
  const sample = {
    textPlacement: "bottom-left", align: "left", textWidthRatio: 0.8, fontSize: 96, lines: 2, weight: "bold", fontKind: "sans",
    background: "dark", textColor: "#FFFFFF", overlayOpacity: 0.4, gradient: "bottom", note: "하단 좌측 큰 제목",
  };

  it("모델 텍스트에서 JSON 만 뽑아 검증", () => {
    const a = parseAnalysis(`여기 결과입니다:\n${JSON.stringify(sample)}\n끝`);
    expect(a.fontSize).toBe(96);
    expect(() => parseAnalysis("no json here")).toThrow();
    expect(() => parseAnalysis(JSON.stringify({ ...sample, textPlacement: "nowhere" }))).toThrow();
  });

  it("분석 → 기본 프리셋 + 오버라이드", () => {
    const a = LayoutAnalysisSchema.parse(sample);
    const { base, overrides } = analysisToPreset(a);
    expect(base).toBe("large-editorial");
    expect(overrides.textPlacement).toBe("bottom-left");
    expect(overrides.defaultFontSize).toBe(96);
    expect(overrides.toneDefaults?.weight).toBe(700);
    expect(overrides.toneDefaults?.background).toBe("#0a0a0a");
    expect(analysisToPreset({ ...a, textPlacement: "center", background: "light" }).base).toBe("quote-center");
    expect(analysisToPreset({ ...a, textPlacement: "top-left" }).base).toBe("info-dark");
  });
});

describe("사진 보정", () => {
  it("새 보정 필드는 기본 0 — 기존 저장본(필드 없음)도 그대로 읽힌다", async () => {
    const { SlideEditorStateSchema } = await import("@/types");
    const st = SlideEditorStateSchema.parse({ image: { brightness: 0.1 } });
    expect(st.image.warmth).toBe(0);
    expect(st.image.fade).toBe(0);
    expect(st.image.vignette).toBe(0);
    expect(() => SlideEditorStateSchema.parse({ image: { warmth: 101 } })).toThrow();
  });

  it("색온도는 R↑ B↓, 페이드는 블랙을 올리고 화이트는 유지", async () => {
    const { applyWarmth, applyFade } = await import("@/lib/render/photo-filters");
    const warm = new Uint8ClampedArray([100, 100, 100, 255]);
    applyWarmth(warm, 100);
    expect(warm[0]).toBeGreaterThan(100);
    expect(warm[2]).toBeLessThan(100);
    const cool = new Uint8ClampedArray([100, 100, 100, 255]);
    applyWarmth(cool, -100);
    expect(cool[0]).toBeLessThan(100);
    expect(cool[2]).toBeGreaterThan(100);
    const px = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    applyFade(px, 100);
    expect(px[0]).toBeGreaterThan(60);
    expect(px[4]).toBe(255);
    expect(px[3]).toBe(255);
  });

  it("룩 프리셋 값은 스키마 범위 안", async () => {
    const { LOOKS } = await import("@/presets/looks");
    const { SlideEditorStateSchema } = await import("@/types");
    for (const l of LOOKS) expect(() => SlideEditorStateSchema.parse({ image: l.values })).not.toThrow();
  });
});

describe("레퍼런스 · 템플릿 · 팔레트", () => {
  it("팔레트 추출: 비중 순으로, 비슷한 색은 합쳐서", async () => {
    const { quantizePalette, luminance, readableOn } = await import("@/lib/render/palette");
    // 네이비 70% + 민트 20% + 거의 네이비인 색 10%
    const px: number[] = [];
    const push = (r: number, g: number, b: number, n: number) => { for (let i = 0; i < n; i++) px.push(r, g, b, 255); };
    push(11, 31, 58, 70);
    push(94, 234, 212, 20);
    push(14, 34, 62, 10);
    const pal = quantizePalette(px, 3);
    expect(pal.length).toBe(2);
    expect(pal[0]).toBe("#0B1F3A");
    expect(pal[1]).toBe("#5EEAD4");
    expect(luminance("#FFFFFF")).toBeGreaterThan(0.9);
    expect(readableOn("#0B1F3A")).toBe("#FFFFFF");
    expect(readableOn("#F5F0E1")).toBe("#111111");
    expect(quantizePalette([0, 0, 0, 0], 3)).toEqual([]);
  });

  it("내장 템플릿은 모두 스키마를 통과하고 id 가 겹치지 않는다", async () => {
    const { BUILTIN_TEMPLATES } = await import("@/presets/templates");
    expect(BUILTIN_TEMPLATES.length).toBeGreaterThanOrEqual(15);
    expect(new Set(BUILTIN_TEMPLATES.map((t) => t.id)).size).toBe(BUILTIN_TEMPLATES.length);
    for (const t of BUILTIN_TEMPLATES) {
      // 텍스트 레이어는 캔버스(1080) 안에 있어야 한다
      for (const l of t.design.layers) {
        expect(l.x).toBeGreaterThan(-1);
        expect(l.x).toBeLessThan(1081);
        expect(l.y).toBeGreaterThan(-1);
        expect(l.y).toBeLessThan(1351);
      }
    }
  });

  it("레퍼런스 스키마: 팔레트 형식·태그 수를 검증", async () => {
    const { ReferenceSchema } = await import("@/types");
    const base = { id: "ref-abc", title: "t", created_at: "a", updated_at: "b" };
    expect(ReferenceSchema.parse(base).kind).toBe("feed");
    expect(() => ReferenceSchema.parse({ ...base, palette: ["red"] })).toThrow();
    expect(() => ReferenceSchema.parse({ ...base, id: "x" })).toThrow();
  });
});
