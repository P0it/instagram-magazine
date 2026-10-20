import "server-only";
import { createPublicKey, verify, type JsonWebKey as NodeJwk } from "node:crypto";
import { AiError } from "./types";

export interface Jwks {
  keys: (NodeJwk & { kid?: string; alg?: string })[];
}

export interface IdTokenExpectation {
  issuer: string;
  audience: string;
  nonce: string;
  now?: number;
}

export interface IdTokenClaims {
  sub: string;
  email?: string;
  exp: number;
}

const fail = (message: string) => new AiError("auth", message);
const decode = (part: string): unknown => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

/**
 * OpenID Connect ID 토큰 검증: 서명(RS256·ES256, JWKS), issuer, audience, 만료, nonce.
 * 하나라도 어긋나면 로그인을 실패시킨다 — 클레임만 읽고 넘어가지 않는다.
 */
export function verifyIdToken(token: string, jwks: Jwks, expected: IdTokenExpectation): IdTokenClaims {
  const parts = token.split(".");
  if (parts.length !== 3) throw fail("로그인 응답의 ID 토큰 형식이 올바르지 않아요");
  const [head, body, sig] = parts as [string, string, string];

  let header: { alg?: string; kid?: string };
  let claims: Record<string, unknown>;
  try {
    header = decode(head) as typeof header;
    claims = decode(body) as typeof claims;
  } catch {
    throw fail("로그인 응답의 ID 토큰을 읽지 못했어요");
  }

  const candidates = jwks.keys.filter((k) => (header.kid ? k.kid === header.kid : true));
  const jwk = candidates[0];
  if (!jwk) throw fail("ID 토큰 서명 키를 찾지 못했어요");
  let ok = false;
  try {
    const key = createPublicKey({ key: jwk as NodeJwk, format: "jwk" });
    const data = Buffer.from(`${head}.${body}`);
    const signature = Buffer.from(sig, "base64url");
    if (header.alg === "RS256") ok = verify("RSA-SHA256", data, key, signature);
    else if (header.alg === "ES256") ok = verify("sha256", data, { key, dsaEncoding: "ieee-p1363" }, signature);
  } catch {
    ok = false;
  }
  if (!ok) throw fail("ID 토큰 서명이 올바르지 않아요");

  const now = Math.floor((expected.now ?? Date.now()) / 1000);
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== expected.issuer) throw fail("로그인 응답의 ID 토큰 발급자(iss)가 맞지 않아요");
  if (!aud.includes(expected.audience)) throw fail("로그인 응답의 ID 토큰 대상(aud)이 이 앱이 아니에요");
  if (typeof claims.exp !== "number" || claims.exp <= now) throw fail("로그인 응답의 ID 토큰이 만료됐어요");
  if (claims.nonce !== expected.nonce) throw fail("로그인 응답의 ID 토큰 nonce 가 맞지 않아요");
  if (typeof claims.sub !== "string" || !claims.sub) throw fail("로그인 응답의 ID 토큰에 계정 식별자(sub)가 없어요");
  return { sub: claims.sub, exp: claims.exp, ...(typeof claims.email === "string" ? { email: claims.email } : {}) };
}
