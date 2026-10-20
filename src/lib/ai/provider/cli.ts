import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import type { AiProviderStatus } from "@/types";
import { parseJsonReply } from "./json-reply";
import { AiError, type AiProvider, type AiRequest } from "./types";

/**
 * 이 PC 에 로그인된 **수정하지 않은 `claude` CLI** 를 호출하는 Claude 제공자.
 * Anthropic 은 제3자 앱이 Claude 구독 토큰을 받거나 저장하는 것을 허용하지 않으므로(공식 문서),
 * 앱은 토큰을 만지지 않고 CLI 의 로그인 상태만 확인한다. 로그인은 사용자가 터미널에서 `claude auth login`.
 * 조사 근거: docs/superpowers/notes/2026-10-21-ai-provider-spike.md
 */
export type ExecOptions = { cwd?: string; timeout?: number; maxBuffer?: number; signal?: AbortSignal; windowsHide?: boolean };
export type ExecFn = (file: string, args: string[], opts: ExecOptions) => Promise<{ stdout: string }>;

const execFileAsync = promisify(execFile);
const defaultExec: ExecFn = async (file, args, opts) => {
  const { stdout } = await execFileAsync(file, args, { ...opts, encoding: "utf8" });
  return { stdout };
};

const StatusSchema = z.object({ loggedIn: z.boolean(), email: z.string().optional() });
const EnvelopeSchema = z.object({ result: z.unknown().optional(), is_error: z.boolean().optional() });

const CALL_TIMEOUT_MS = 180_000;
const NOT_FOUND = "Claude Code CLI(claude)를 찾을 수 없어요. 이 PC 에 설치돼 있어야 해요.";
const NOT_LOGGED_IN = "Claude 에 로그인되어 있지 않아요. 터미널에서 `claude auth login` 을 실행해 주세요.";

const isMissing = (e: unknown) => (e as NodeJS.ErrnoException | undefined)?.code === "ENOENT";

/** CLI 가 돌려준 오류 문구를 작업 실패 분류로 옮긴다 */
function classify(message: string): AiError {
  if (/usage limit|rate limit|limit reached|too many requests|quota/i.test(message)) return new AiError("quota", `Claude 사용 한도에 도달했어요: ${message.slice(0, 160)}`);
  if (/not logged in|\/login|log in|authenticat|unauthori[sz]ed|credential|invalid api key/i.test(message)) return new AiError("auth", NOT_LOGGED_IN);
  return new AiError("internal", `claude CLI 오류: ${message.slice(0, 300)}`);
}

export function createClaudeCliProvider(deps: { exec?: ExecFn; bin?: string } = {}): AiProvider {
  const exec = deps.exec ?? defaultExec;
  const bin = () => deps.bin ?? process.env.CLAUDE_CLI_PATH ?? "claude";
  const model = () => process.env.AI_CLAUDE_MODEL || "sonnet";

  async function status(): Promise<AiProviderStatus> {
    const base = { id: "claude" as const, kind: "cli" as const, supports_images: true };
    try {
      const { stdout } = await exec(bin(), ["auth", "status", "--json"], { timeout: 15_000, windowsHide: true });
      const parsed = StatusSchema.safeParse(JSON.parse(stdout));
      if (parsed.success && parsed.data.loggedIn) return { ...base, connected: true, ...(parsed.data.email ? { account: parsed.data.email } : {}) };
      return { ...base, connected: false, last_error: NOT_LOGGED_IN };
    } catch (e) {
      return { ...base, connected: false, last_error: isMissing(e) ? NOT_FOUND : NOT_LOGGED_IN };
    }
  }

  async function complete<S extends z.ZodTypeAny>(req: AiRequest<S>): Promise<z.output<S>> {
    const dir = await mkdtemp(path.join(tmpdir(), "md-ai-"));
    try {
      const files: string[] = [];
      for (const [i, img] of (req.images ?? []).entries()) {
        const ext = img.mime === "image/png" ? "png" : img.mime === "image/webp" ? "webp" : "jpg";
        const file = path.join(dir, `image-${i}.${ext}`);
        await writeFile(file, img.bytes);
        files.push(file);
      }
      const reading = files.length > 0 ? `\n\n먼저 Read 도구로 다음 이미지 파일을 읽으세요: ${files.map((f) => `"${f}"`).join(", ")}` : "";
      const prompt = `${req.system}\n\n${req.user}${reading}`;
      const args = ["-p", prompt, "--output-format", "json", "--model", model(), ...(files.length > 0 ? ["--allowedTools", "Read"] : [])];

      let stdout: string;
      try {
        // 프로젝트 밖(임시 폴더)에서 실행해 이 레포의 CLAUDE.md 가 섞이지 않게 한다
        ({ stdout } = await exec(bin(), args, { cwd: dir, timeout: CALL_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, signal: req.signal, windowsHide: true }));
      } catch (e) {
        if (isMissing(e)) throw new AiError("auth", NOT_FOUND);
        const err = e as { stderr?: unknown; stdout?: unknown; message?: string };
        throw classify(`${String(err.stderr ?? "")} ${String(err.stdout ?? "")} ${err.message ?? ""}`.trim());
      }

      let envelope: z.infer<typeof EnvelopeSchema>;
      try {
        envelope = EnvelopeSchema.parse(JSON.parse(stdout));
      } catch {
        throw new AiError("invalid_output", "claude CLI 응답을 읽지 못했어요");
      }
      const text = typeof envelope.result === "string" ? envelope.result : "";
      if (envelope.is_error) throw classify(text);
      return parseJsonReply(req.schema, text);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  return { id: "claude", kind: "cli", supportsImages: true, status, complete };
}
