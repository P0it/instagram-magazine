/**
 * 로컬 레퍼런스 이미지 폴더 → style-pack.json 스켈레톤.
 * 외부 API 호출 없음. 이미지 헤더에서 크기/비율만 읽고, 파일명 규칙으로 역할을 추정한다.
 *
 *   npx tsx scripts/analyze-references.ts ./refs [--id my-pack] [--name "My Pack"] [--out ./my-pack.json]
 *
 * 결과 JSON 을 설정 → 스타일팩 → 임포트 에 붙이거나, Claude Code 에게 색/타이포를 채워달라고 요청한다.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { StylePackSchema } from "../src/types/style-pack";
import { readImageDims } from "../src/lib/metadata/image-dims";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
if (!dir) {
  console.error("usage: analyze-references <dir> [--id id] [--name name] [--out file]");
  process.exit(1);
}
const opt = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const files = readdirSync(dir)
  .filter((f) => [".png", ".jpg", ".jpeg", ".webp"].includes(extname(f).toLowerCase()))
  .map((f) => join(dir, f))
  .filter((p) => statSync(p).isFile());

interface RefInfo {
  file: string;
  width: number;
  height: number;
  ratio: string;
  role: string;
}

const refs: RefInfo[] = files.map((p) => {
  const dims = readImageDims(new Uint8Array(readFileSync(p)));
  const name = basename(p).toLowerCase();
  const role = name.includes("cover") ? "cover" : name.includes("quote") ? "quote" : name.includes("shot") ? "screenshot" : name.includes("clos") || name.includes("end") ? "closing" : name.includes("photo") ? "photo" : "info";
  const w = dims?.width ?? 0;
  const h = dims?.height ?? 0;
  return { file: basename(p), width: w, height: h, ratio: h && w ? (w / h).toFixed(3) : "?", role };
});

const portrait = refs.filter((r) => r.width && Math.abs(r.width / r.height - 0.8) < 0.02).length;
const id = opt("id") ?? (basename(resolve(dir)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "reference-pack");

const pack = StylePackSchema.parse({
  id,
  name: opt("name") ?? `Reference · ${id}`,
  description: `${refs.length} references (${portrait} at 4:5). 색/타이포는 레퍼런스를 보고 채워 넣을 것.`,
  palette: { background: "#0a0a0a", text: "#ffffff", accent: "#e5e5e5", muted: "#8a8a8a" },
  typography: { fontFamily: "sans", headlineWeight: 700, bodyWeight: 500, letterSpacing: -1, lineHeight: 1.25 },
  tone: {},
  presets_by_role: Object.fromEntries(
    [...new Set(refs.map((r) => r.role))].map((role) => [
      role,
      { cover: "large-editorial", photo: "cover-bottom", info: "info-dark", quote: "quote-center", screenshot: "screenshot-frame", closing: "closing-slide" }[role] ?? "info-dark",
    ]),
  ),
  preset_overrides: {},
  references: refs.map((r) => `${r.file} (${r.width}×${r.height}, ${r.role})`),
});

const out = opt("out") ?? `${id}.style-pack.json`;
writeFileSync(out, JSON.stringify(pack, null, 2) + "\n");
console.table(refs);
console.log(`\n→ ${out}`);
if (portrait !== refs.length) console.warn(`주의: ${refs.length - portrait}개 레퍼런스가 4:5 가 아닙니다.`);
