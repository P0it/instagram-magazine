import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { ReferenceInsightDraftSchema, type Reference, type ReferenceInsight } from "@/types";
import { hasSdkCredentials } from "./layout-analyst";

const execFileAsync = promisify(execFile);
const MODEL = "claude-opus-5";
const MAX_IMAGES = 6;

export type VisionImage = { bytes: Uint8Array; mime: "image/png" | "image/jpeg" | "image/webp" };

const SYSTEM = `You are three Korean Instagram-magazine experts reading ONE carousel post (its slides are attached in order).
- curator: what topic was chosen, from what angle, in what tone.
- marketer: why people stop, swipe and save — hook type, slide structure, call-to-action, save trigger.
- uiux: layout of the cover and body slides, type treatment, colour palette, text density — described so an editor could rebuild the structure.
Describe structure only. Never copy long phrases from the slides. Do not guess numbers you cannot see. All free-text in Korean, concise.
Reply with ONLY a JSON object, no prose, no code fences:
{
 "curator": { "topic": str≤80, "angle": str≤120, "tone": str≤40, "takeaway": str≤120 },
 "marketer": { "hook_type": "number"|"question"|"curiosity"|"urgency"|"benefit"|"provocation"|"statement"|"other", "hook_note": str≤120, "structure": str≤160, "cta": str≤100, "save_trigger": str≤100 },
 "uiux": { "cover_layout": str≤140, "body_layout": str≤140, "typography": str≤120, "palette": ["#RRGGBB" x≤5], "density": "low"|"mid"|"high" },
 "why": [str≤110 x≤4],
 "reuse": [str≤110 x≤3]
}
"why" = why this post works. "reuse" = how a life-information magazine could reuse the structure (not the content).`;

function userPrompt(ref: Reference, n: number): string {
  const meta = [`제목: ${ref.title}`, ref.account && `계정: ${ref.account}`, ref.metrics?.likes != null && `좋아요: ${ref.metrics.likes}`, `슬라이드 ${ref.images.length}장 중 ${n}장을 첨부`, ref.note && `메모: ${ref.note}`].filter(Boolean).join("\n");
  return `${meta}\n\n이 게시물을 읽고 JSON 으로만 답하세요.`;
}

/** 슬라이드가 많으면 표지·끝을 포함해 고르게 뽑는다 */
export function pickSlides<T>(items: T[], max = MAX_IMAGES): T[] {
  if (items.length <= max) return items;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(items[Math.round((i * (items.length - 1)) / (max - 1))]!);
  return out;
}

/** SDK(API 키) → 안 되면 로컬 claude CLI 순으로 물어서 원문을 돌려준다 */
export async function askClaude(system: string, prompt: string, images: VisionImage[] = []): Promise<{ text: string; provider: "sdk" | "cli" }> {
  if (hasSdkCredentials()) {
    try {
      return { text: await viaSdk(system, prompt, images), provider: "sdk" };
    } catch (e) {
      if (!(e instanceof Anthropic.AuthenticationError)) throw e;
    }
  }
  return { text: await viaCli(system, prompt, images), provider: "cli" };
}

export async function analyzeReferencePost(ref: Reference, images: VisionImage[]): Promise<Omit<ReferenceInsight, "analyzed_at">> {
  const { text, provider } = await askClaude(SYSTEM, userPrompt(ref, images.length), images);
  return { ...parse(text), provider };
}

function parse(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("분석 결과에 JSON 이 없어요");
  return ReferenceInsightDraftSchema.parse(JSON.parse(text.slice(start, end + 1)));
}

async function viaSdk(system: string, prompt: string, images: VisionImage[]): Promise<string> {
  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system,
    output_config: { effort: "low" },
    messages: [{ role: "user", content: [...images.map((i) => ({ type: "image" as const, source: { type: "base64" as const, media_type: i.mime, data: Buffer.from(i.bytes).toString("base64") } })), { type: "text" as const, text: prompt }] }],
  });
  if (res.stop_reason === "refusal") throw new Error("분석을 거부했어요 (refusal)");
  return res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

async function viaCli(system: string, prompt: string, images: VisionImage[]): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "md-ref-"));
  try {
    const files: string[] = [];
    for (const [i, im] of images.entries()) {
      const ext = im.mime === "image/png" ? "png" : im.mime === "image/webp" ? "webp" : "jpg";
      const f = path.join(dir, `slide-${String(i + 1).padStart(2, "0")}.${ext}`);
      await writeFile(f, im.bytes);
      files.push(f);
    }
    const look = files.length ? `Read these images in order with the Read tool, then answer:\n${files.join("\n")}\n\n` : "";
    const full = `${system}\n\n${look}${prompt}`;
    const bin = process.env.CLAUDE_CLI_PATH || "claude";
    const { stdout } = await execFileAsync(bin, ["-p", full, "--output-format", "json", "--allowedTools", "Read", "--model", MODEL], {
      cwd: dir,
      timeout: 240_000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    }).catch((e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT") throw new Error("Claude Code CLI(claude)를 찾을 수 없어요. 이 PC 에 설치·로그인돼 있어야 해요 (또는 ANTHROPIC_API_KEY 설정).");
      throw new Error(`claude CLI 실패: ${e.message.slice(0, 300)}`);
    });
    const envelope = JSON.parse(stdout) as { result?: unknown; is_error?: boolean };
    if (envelope.is_error) throw new Error(`claude CLI 오류: ${String(envelope.result ?? "").slice(0, 200)}`);
    return String(envelope.result ?? "");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
