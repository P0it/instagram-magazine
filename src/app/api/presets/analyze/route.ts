import { analysisToPreset, type AnalyzeResponse } from "@/types";
import { analyzeLayout, analysisProvider } from "@/lib/ai/layout-analyst";
import { readImageDims } from "@/lib/metadata/image-dims";
import { error, handle, json } from "@/lib/api/respond";

const MAX_BYTES = 8 * 1024 * 1024;

/** GET /api/presets/analyze — 어떤 경로로 분석하는지 (sdk: API 키 · cli: 로컬 Claude Code 구독) */
export async function GET() {
  return handle(async () => json({ provider: analysisProvider() }));
}

/**
 * POST /api/presets/analyze — multipart { file }. 스크린샷 → 레이아웃 판독 → 기본 프리셋 + 오버라이드.
 * 저장은 하지 않는다 (사용자가 이름을 붙여 POST /api/presets/custom).
 */
export async function POST(req: Request) {
  return handle(async () => {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return error(400, "file field missing", "no_file");
    if (file.size > MAX_BYTES) return error(413, "file exceeds 8MB", "too_large");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const dims = readImageDims(bytes);
    if (!dims || dims.format === "unknown") return error(400, "only PNG/JPEG/WebP supported", "bad_image");
    const mime = dims.format === "png" ? "image/png" : dims.format === "webp" ? "image/webp" : "image/jpeg";
    const { analysis, provider } = await analyzeLayout(bytes, mime);
    const { base, overrides } = analysisToPreset(analysis);
    return json<AnalyzeResponse>({ analysis, base, overrides, provider });
  });
}
