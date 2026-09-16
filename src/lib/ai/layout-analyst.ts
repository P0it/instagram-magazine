import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { LayoutAnalysisSchema, type LayoutAnalysis } from "@/types";

const execFileAsync = promisify(execFile);
const MODEL = "claude-opus-5";

/**
 * 인스타 피드 스크린샷 → 텍스트 레이아웃 판독.
 *
 * 1) `@anthropic-ai/sdk` — ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / `ant auth login` 프로필이 있으면 이걸로.
 * 2) 그 어느 것도 없으면 이 PC 에 로그인된 **Claude Code CLI(구독)** 를 `claude -p` 로 실행해 같은 질문을 한다.
 *    Claude Code 가 임시 파일의 이미지를 직접 읽는다. 이 PC 에서 서버를 돌릴 때만 동작.
 *
 * 둘 다 결과를 LayoutAnalysisSchema 로 검증한다.
 */
export async function analyzeLayout(bytes: Uint8Array, mime: "image/png" | "image/jpeg" | "image/webp"): Promise<{ analysis: LayoutAnalysis; provider: "sdk" | "cli" }> {
  if (hasSdkCredentials()) {
    try {
      return { analysis: await viaSdk(bytes, mime), provider: "sdk" };
    } catch (e) {
      if (!(e instanceof Anthropic.AuthenticationError)) throw e;
      console.warn("[layout-analyst] SDK auth failed, falling back to claude CLI");
    }
  }
  return { analysis: await viaCli(bytes, mime), provider: "cli" };
}

/** SDK 가 자격 증명을 찾을 수 있는지. 환경변수 또는 `ant auth login` 프로필 파일 */
export function hasSdkCredentials(): boolean {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return true;
  return false;
}

export function analysisProvider(): "sdk" | "cli" {
  return hasSdkCredentials() ? "sdk" : "cli";
}

const SYSTEM = `You read a single Instagram feed slide (magazine-style: a headline laid over a photo or flat background) and describe its text layout so it can be reproduced as a layout preset on a 1080-wide canvas.
Reply with ONLY a JSON object — no prose, no code fences — matching exactly:
{
  "textPlacement": "top-left" | "top-center" | "center" | "bottom-left" | "bottom-center" | "lower-third",
  "align": "left" | "center" | "right",
  "textWidthRatio": number (0.2–1, headline box width / canvas width),
  "fontSize": number (24–200, headline size in px on a 1080-wide canvas),
  "lines": integer (1–8, headline line count),
  "weight": "regular" | "medium" | "bold",
  "fontKind": "sans" | "serif",
  "background": "dark" | "light",
  "textColor": "#RRGGBB",
  "overlayOpacity": number (0–1, how much a dark wash sits over the photo),
  "gradient": "none" | "bottom" | "top" | "full",
  "note": string (≤ 200 chars, one-line rationale in Korean)
}`;

const USER = "이 스크린샷의 헤드라인 레이아웃을 읽어 JSON 으로만 답하세요.";

async function viaSdk(bytes: Uint8Array, mime: "image/png" | "image/jpeg" | "image/webp"): Promise<LayoutAnalysis> {
  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    output_config: { effort: "low" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mime, data: Buffer.from(bytes).toString("base64") } },
          { type: "text", text: USER },
        ],
      },
    ],
  });
  if (res.stop_reason === "refusal") throw new Error("분석을 거부했어요 (refusal)");
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return parseAnalysis(text);
}

async function viaCli(bytes: Uint8Array, mime: "image/png" | "image/jpeg" | "image/webp"): Promise<LayoutAnalysis> {
  const dir = await mkdtemp(path.join(tmpdir(), "md-shot-"));
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const file = path.join(dir, `screenshot.${ext}`);
  try {
    await writeFile(file, bytes);
    const prompt = `${SYSTEM}\n\nRead the image file at "${file}" with the Read tool, then answer. ${USER}`;
    const bin = process.env.CLAUDE_CLI_PATH || "claude";
    const { stdout } = await execFileAsync(bin, ["-p", prompt, "--output-format", "json", "--allowedTools", "Read", "--model", MODEL], {
      cwd: dir,
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    }).catch((e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT") throw new Error("Claude Code CLI(claude)를 찾을 수 없어요. 이 PC 에 설치·로그인돼 있어야 해요 (또는 ANTHROPIC_API_KEY 설정).");
      throw new Error(`claude CLI 실패: ${e.message.slice(0, 300)}`);
    });
    const envelope = JSON.parse(stdout) as { result?: unknown; is_error?: boolean };
    if (envelope.is_error) throw new Error(`claude CLI 오류: ${String(envelope.result ?? "").slice(0, 200)}`);
    return parseAnalysis(String(envelope.result ?? ""));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** 모델 출력에서 첫 JSON 객체만 뽑아 검증 */
export function parseAnalysis(text: string): LayoutAnalysis {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("분석 결과에 JSON 이 없어요");
  return LayoutAnalysisSchema.parse(JSON.parse(text.slice(start, end + 1)));
}
