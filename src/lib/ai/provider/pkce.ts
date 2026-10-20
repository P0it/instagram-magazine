import "server-only";
import { createHash, randomBytes } from "node:crypto";

const rand = (bytes: number) => randomBytes(bytes).toString("base64url");

/** OAuth PKCE(S256) + state + nonce. 매 로그인 시도마다 새로 만든다. */
export function makePkce(): { verifier: string; challenge: string; state: string; nonce: string } {
  const verifier = rand(32);
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url"), state: rand(16), nonce: rand(16) };
}
