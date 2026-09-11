import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptString, encryptString } from "@/lib/crypto/aes";
import { issueSignedToken, verifySignedToken } from "@/lib/crypto/signed-url";
import { accessCookieValue, constantTimeEqual, isAccessExempt } from "@/lib/access/key";
import { readImageDims } from "@/lib/metadata/image-dims";
import { makeGradientPng } from "@/mocks/png";

const key = randomBytes(32);

describe("aes", () => {
  it("round trips", () => {
    const enc = encryptString("IGQVJ...secret", key);
    expect(enc).not.toContain("secret");
    expect(decryptString(enc, key)).toBe("IGQVJ...secret");
  });
  it("fails with wrong key", () => {
    const enc = encryptString("x", key);
    expect(() => decryptString(enc, randomBytes(32))).toThrow();
  });
});

describe("signed url", () => {
  it("issues and verifies", () => {
    const now = 1_000_000;
    const t = issueSignedToken({ p: "post", f: "file", e: now + 60 }, key);
    expect(verifySignedToken(t, key, now)).toEqual({ p: "post", f: "file", e: now + 60 });
  });
  it("rejects expired, tampered, wrong key", () => {
    const now = 1_000_000;
    const t = issueSignedToken({ p: "post", f: "file", e: now + 60 }, key);
    expect(verifySignedToken(t, key, now + 61)).toBeNull();
    expect(verifySignedToken(t + "x", key, now)).toBeNull();
    expect(verifySignedToken(t, randomBytes(32), now)).toBeNull();
    const [body] = t.split(".");
    expect(verifySignedToken(`${body}.abc`, key, now)).toBeNull();
  });
});

describe("access key", () => {
  it("cookie value is deterministic hex", async () => {
    const a = await accessCookieValue("secret-key");
    const b = await accessCookieValue("secret-key");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await accessCookieValue("other")).not.toBe(a);
  });
  it("constantTimeEqual + exempt paths", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(isAccessExempt("/api/public/xyz")).toBe(true);
    expect(isAccessExempt("/api/cron/publish")).toBe(true);
    expect(isAccessExempt("/api/posts")).toBe(false);
    expect(isAccessExempt("/dashboard")).toBe(false);
  });
});

describe("image dims", () => {
  it("reads png header", () => {
    const png = makeGradientPng(1080, 1350, { r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 });
    expect(readImageDims(png)).toEqual({ width: 1080, height: 1350, format: "png" });
  });
  it("reads jpeg SOF", () => {
    // minimal JPEG: SOI, APP0 stub, SOF0 with 1350x1080
    const bytes = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x0b, 0x08, 0x05, 0x46, 0x04, 0x38, 0x01, 0x01, 0x11, 0x00,
      0xff, 0xd9,
    ]);
    expect(readImageDims(bytes)).toEqual({ width: 1080, height: 1350, format: "jpeg" });
  });
  it("returns null for garbage", () => {
    expect(readImageDims(new Uint8Array(40))).toBeNull();
  });
});
