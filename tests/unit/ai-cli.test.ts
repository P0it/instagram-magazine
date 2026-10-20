import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createClaudeCliProvider, type ExecFn } from "@/lib/ai/provider/cli";

const S = z.object({ n: z.number() });
const envelope = (result: string, is_error = false) => JSON.stringify({ type: "result", is_error, result });

function fakeExec(handler: (file: string, args: string[], cwd?: string) => string | Error): { exec: ExecFn; calls: { file: string; args: string[]; cwd?: string }[] } {
  const calls: { file: string; args: string[]; cwd?: string }[] = [];
  const exec: ExecFn = async (file, args, opts) => {
    calls.push({ file, args, cwd: opts.cwd });
    const out = handler(file, args, opts.cwd);
    if (out instanceof Error) throw out;
    return { stdout: out };
  };
  return { exec, calls };
}
const enoent = () => Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" });

describe("claude CLI provider", () => {
  it("reports the logged-in account without leaking org details", async () => {
    const { exec } = fakeExec(() => JSON.stringify({ loggedIn: true, email: "me@example.com", orgId: "org-secret", orgName: "Org", subscriptionType: "max" }));
    const status = await createClaudeCliProvider({ exec }).status();
    expect(status).toEqual({ id: "claude", connected: true, kind: "cli", account: "me@example.com", supports_images: true });
    expect(JSON.stringify(status)).not.toContain("org-secret");
  });

  it("reports not connected with a hint when the CLI is missing or logged out", async () => {
    const missing = await createClaudeCliProvider({ exec: fakeExec(() => enoent()).exec }).status();
    expect(missing.connected).toBe(false);
    expect(missing.last_error).toContain("찾을 수 없어요");
    const out = await createClaudeCliProvider({ exec: fakeExec(() => JSON.stringify({ loggedIn: false })).exec }).status();
    expect(out.connected).toBe(false);
    expect(out.last_error).toContain("claude auth login");
  });

  it("runs `claude -p` outside the project and parses fenced json from the result", async () => {
    const { exec, calls } = fakeExec(() => envelope('```json\n{"n":3}\n```'));
    const out = await createClaudeCliProvider({ exec }).complete({ system: "SYS", user: "USER", schema: S });
    expect(out).toEqual({ n: 3 });
    const call = calls[0]!;
    expect(call.args[0]).toBe("-p");
    expect(call.args[1]).toContain("SYS");
    expect(call.args[1]).toContain("USER");
    expect(call.args).toEqual(expect.arrayContaining(["--output-format", "json", "--model"]));
    expect(call.cwd).not.toBe(process.cwd());
  });

  it("writes images to a temp folder for the Read tool and removes them afterwards", async () => {
    let seenPath = "";
    const { exec, calls } = fakeExec((_f, args) => {
      seenPath = /"([^"]+image-0\.png)"/.exec(args[1]!)?.[1] ?? "";
      expect(existsSync(seenPath)).toBe(true);
      return envelope('{"n":1}');
    });
    await createClaudeCliProvider({ exec }).complete({ system: "s", user: "u", schema: S, images: [{ mime: "image/png", bytes: new Uint8Array([1, 2, 3]) }] });
    expect(seenPath).toContain("image-0.png");
    expect(existsSync(seenPath)).toBe(false);
    expect(calls[0]!.args).toEqual(expect.arrayContaining(["--allowedTools", "Read"]));
  });

  it("maps usage-limit and login failures to quota and auth", async () => {
    const quota = createClaudeCliProvider({ exec: fakeExec(() => envelope("5-hour usage limit reached", true)).exec });
    await expect(quota.complete({ system: "s", user: "u", schema: S })).rejects.toMatchObject({ kind: "quota" });
    const auth = createClaudeCliProvider({ exec: fakeExec(() => Object.assign(new Error("exit 1"), { stderr: "Not logged in · Please run /login" })).exec });
    await expect(auth.complete({ system: "s", user: "u", schema: S })).rejects.toMatchObject({ kind: "auth" });
    const missing = createClaudeCliProvider({ exec: fakeExec(() => enoent()).exec });
    await expect(missing.complete({ system: "s", user: "u", schema: S })).rejects.toMatchObject({ kind: "auth" });
  });

  it("fails with invalid_output when the result is not the expected json", async () => {
    const p = createClaudeCliProvider({ exec: fakeExec(() => envelope("그냥 글")).exec });
    await expect(p.complete({ system: "s", user: "u", schema: S })).rejects.toMatchObject({ kind: "invalid_output" });
  });
});
