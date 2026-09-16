import { describe, expect, it } from "vitest";
import { EditorStateSchema, FORMAT_INFO, LayoutAnalysisSchema, POST_FORMATS, PostMetadataSchema, analysisToPreset, formatDims, formatOfDims } from "@/types";
import { evaluateApprovalGate } from "@/lib/metadata/approval-gate";
import { reflowSlideForHeight, slideStateFromPreset, textGeometryFromPreset } from "@/lib/render/layout";
import { getPreset } from "@/presets";
import { parseAnalysis } from "@/lib/ai/layout-analyst";

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
    st.layers.push({ id: "l1", kind: "sticker", key: "tape", asset: null, x: 540, y: 1300, width: 300, rotation: 0, opacity: 1, flip: false, text: "", color: "#fff", bg: null, ink: null, fontFamily: "sans", hidden: false, locked: false });
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
