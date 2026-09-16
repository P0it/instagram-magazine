import type { ApprovalCheck, ApprovalGateResult, PostMetadata, SourcesFile } from "@/types";
import type { ImageDims } from "./image-dims";

export const CAPTION_MAX = 2200;
export const HASHTAG_MAX = 30;
import { formatDims } from "@/types";

export const RENDER_W = 1080;
/** 기본(4:5) 렌더 높이. 게이트는 metadata.format 기준으로 검사한다 */
export const RENDER_H = 1350;

export interface GateInput {
  metadata: PostMetadata;
  sources: SourcesFile;
  /** renders 폴더의 각 파일 크기 (헤더 파싱 결과). null 이면 읽기 실패 */
  renderDims: (ImageDims | null)[];
}

/** 승인 게이트 — 서버에서 강제. 순수 함수라 테스트 용이. */
export function evaluateApprovalGate(input: GateInput): ApprovalGateResult {
  const { metadata, sources, renderDims } = input;
  const checks: ApprovalCheck[] = [];

  checks.push({
    id: "has_headline",
    label: "헤드라인 있음",
    ok: metadata.headline.trim().length > 0,
    detail: metadata.headline.trim() ? "" : "헤드라인이 비어 있습니다",
  });

  checks.push({
    id: "has_slides",
    label: "슬라이드 1장 이상",
    ok: metadata.slides.length > 0,
    detail: metadata.slides.length > 0 ? `${metadata.slides.length}장` : "슬라이드가 없습니다",
  });

  const renderOk = renderDims.length === metadata.slides.length && metadata.slides.length > 0;
  checks.push({
    id: "render_count",
    label: "렌더 수 = 슬라이드 수",
    ok: renderOk,
    detail: `렌더 ${renderDims.length} / 슬라이드 ${metadata.slides.length}`,
  });

  const want = formatDims(metadata.format);
  const badDims = renderDims
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => !d || d.width !== want.width || d.height !== want.height);
  checks.push({
    id: "render_dimensions",
    label: `모든 렌더 ${want.width}×${want.height} (${metadata.format})`,
    ok: renderDims.length > 0 && badDims.length === 0,
    detail:
      renderDims.length === 0
        ? "렌더가 없습니다"
        : badDims.length === 0
          ? ""
          : badDims.map(({ d, i }) => `slide ${i + 1}: ${d ? `${d.width}×${d.height}` : "읽기 실패"}`).join(", "),
  });

  const captionLen = fullCaption(metadata).length;
  checks.push({
    id: "caption_length",
    label: `캡션 ≤ ${CAPTION_MAX}자`,
    ok: captionLen <= CAPTION_MAX,
    detail: `${captionLen}자`,
  });

  checks.push({
    id: "hashtag_count",
    label: `해시태그 ≤ ${HASHTAG_MAX}개`,
    ok: metadata.hashtags.length <= HASHTAG_MAX,
    detail: `${metadata.hashtags.length}개`,
  });

  const factOk = !metadata.fact_check_required || sources.fact_check_status === "approved";
  checks.push({
    id: "fact_check",
    label: metadata.fact_check_required ? "팩트체크 승인 (채널 규칙)" : "팩트체크 (선택)",
    ok: factOk,
    detail: metadata.fact_check_required ? `현재: ${sources.fact_check_status}` : "이 채널은 필수 아님",
  });

  return { ok: checks.every((c) => c.ok), checks };
}

/** 캡션 + 해시태그 최종 문자열 */
export function fullCaption(metadata: PostMetadata): string {
  const tags = metadata.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
  return [metadata.caption.trim(), tags].filter(Boolean).join("\n\n");
}
