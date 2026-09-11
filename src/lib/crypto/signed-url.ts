import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const SignedPayloadSchema = z.object({
  p: z.string(), // post_id
  f: z.string(), // drive file id
  e: z.number().int(), // exp (unix seconds)
});
export type SignedPayload = z.infer<typeof SignedPayloadSchema>;

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(body: string, key: Buffer): string {
  return b64url(createHmac("sha256", key).update(body).digest());
}

/** 토큰 = base64url(payload json) + "." + base64url(hmac) */
export function issueSignedToken(payload: SignedPayload, key: Buffer): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${body}.${sign(body, key)}`;
}

export function verifySignedToken(token: string, key: Buffer, now = Math.floor(Date.now() / 1000)): SignedPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body, key);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromB64url(body).toString("utf8"));
  } catch {
    return null;
  }
  const res = SignedPayloadSchema.safeParse(parsed);
  if (!res.success) return null;
  if (res.data.e <= now) return null;
  return res.data;
}

export const SIGNED_URL_TTL_SECONDS = 30 * 60;
