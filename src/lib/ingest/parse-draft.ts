import { InboxFrontMatterSchema, type InboxFrontMatter, type ParsedInboxDoc, type ParsedSlide } from "@/types";
import { normalizeRole, parseInboxMarkdown } from "./parse-md";

/**
 * ChatGPT 가 만드는 초안은 형식이 조금씩 다르다. 셋 다 같은 ParsedInboxDoc 으로 맞춘다.
 *  1. .md — front-matter + `## slide N (role)` + `## caption`   (parse-md)
 *  2. JSON — `{ headline, slides: [{ role, text | headline+body }], caption, hashtags, source_urls }`
 *  3. 느슨한 YAML 텍스트 — `key: value` 줄 + `slides:` 아래 `1) role: …` 블록  (Google Docs 로 오는 최근 형식)
 */
export type DraftFormat = "markdown" | "json" | "loose";

export function detectDraftFormat(text: string): DraftFormat {
  const t = text.trim();
  if (t.startsWith("{")) return "json";
  if (/^---\s*$/m.test(t.slice(0, 10)) || /^##\s*slide/im.test(t)) return "markdown";
  return "loose";
}

export function parseDraft(text: string): ParsedInboxDoc & { format: DraftFormat } {
  const format = detectDraftFormat(text);
  if (format === "json") {
    const parsed = parseJsonDraft(text);
    if (parsed) return { ...parsed, format };
    // JSON 처럼 보였지만 깨진 경우 — 느슨한 파서로 최대한 건진다
    return { ...parseLooseDraft(text), problems: ["json parse failed; parsed loosely"], format: "loose" };
  }
  if (format === "markdown") return { ...parseInboxMarkdown(text), format };
  return { ...parseLooseDraft(text), format };
}

// ---------------- 공통 ----------------

function str(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number") return String(v);
  return undefined;
}

function splitHashtags(v: unknown): string[] | undefined {
  const arr = Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(/[\s,]+/) : [];
  const tags = arr.map((h) => h.replace(/^#/, "").trim()).filter(Boolean);
  return tags.length ? [...new Set(tags)] : undefined;
}

function toSources(urls: unknown): InboxFrontMatter["sources"] {
  const list = Array.isArray(urls) ? urls : typeof urls === "string" ? [urls] : [];
  const out = list.map(String).map((u) => u.trim()).filter((u) => /^https?:\/\//.test(u)).map((url) => ({ url, title: url.replace(/^https?:\/\//, "").split("/")[0] }));
  return out.length ? out : undefined;
}

/** 슬라이드 텍스트 = headline + body. 둘 다 없으면 text. */
function slideText(o: Record<string, unknown>): string {
  const direct = str(o.text);
  if (direct) return direct.replace(/\\n/g, "\n");
  const parts = [str(o.headline), str(o.body)].filter((x): x is string => Boolean(x));
  return parts.join("\n").replace(/\\n/g, "\n");
}

function finish(fm: InboxFrontMatter, slides: ParsedSlide[], caption: string, problems: string[]): ParsedInboxDoc {
  const fmResult = InboxFrontMatterSchema.safeParse(fm);
  const frontMatter = fmResult.success ? fmResult.data : InboxFrontMatterSchema.partial().parse({});
  if (!fmResult.success) problems.push(`front-matter invalid: ${fmResult.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  if (slides.length === 0) problems.push("no slides found");
  if (!caption) problems.push("caption missing");
  let out = frontMatter;
  if (!out.headline) {
    const first = slides[0]?.text.split("\n")[0]?.trim();
    if (first) out = { ...out, headline: first };
    else problems.push("headline missing");
  }
  return { frontMatter: out, slides, caption, problems };
}

// ---------------- JSON ----------------

export function parseJsonDraft(text: string): ParsedInboxDoc | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const rawSlides = Array.isArray(d.slides) ? d.slides : [];
  const total = rawSlides.length;
  const slides: ParsedSlide[] = rawSlides.map((s, i) => {
    const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    return { index: i + 1, role: normalizeRole(str(o.role), i + 1, total), text: slideText(o) };
  });
  const fm: InboxFrontMatter = {
    channel: str(d.channel)?.toLowerCase().replace(/^@/, ""),
    content_type: total > 1 ? "carousel" : total === 1 ? "single" : undefined,
    topic: str(d.topic),
    headline: str(d.headline)?.replace(/\\n/g, "\n"),
    hashtags: splitHashtags(d.hashtags),
    sources: toSources(d.source_urls ?? d.sources),
    visual_direction: str(d.angle) ?? str(d.editorial_angle),
  };
  return finish(fm, slides, str(d.caption) ?? "", []);
}

// ---------------- 느슨한 YAML 텍스트 ----------------

const KEY_LINE = /^([a-z][a-z0-9_ /]*?):\s*(.*)$/i;
const SLIDE_START = /^\s*(\d+)\)\s*(.*)$/;
const LIST_ITEM = /^\s*(?:[-•]|\d+\.)\s+(.*)$/;
/** 대문자 섹션 제목 줄 ("EDITORIAL ANGLE", "SLIDE 2 — WHAT YOU GET", "SOURCE URLS") */
const SECTION_HEADER = /^([A-Z][A-Z0-9 _/&]*[A-Z0-9])(?:\s*[—–-]\s*(.*))?$/;
const SECTION_SLIDE = /^SLIDE\s+(\d+)$/i;
const SLIDE_KEYS = /^(role|headline|body|text|asset_mode|visual|visual_prompt|layout_preset|tone_preset|render_notes|motion_preset|source_guidance|evidence_[a-z_]+|verified_at)\b/i;

/**
 * 세 번째 변형: 대문자 섹션 제목으로 나뉜 문서를 `key:` / `N)` 형태로 바꿔 같은 파서에 태운다.
 *   TOPIC / EDITORIAL ANGLE / HEADLINE / SLIDE 1 — COVER / CAPTION / SOURCE URLS …
 */
function normalizeSectionHeaders(lines: string[]): string[] {
  const out: string[] = [];
  let sawSlide = false;
  for (const raw of lines) {
    const line = raw.trim();
    const m = SECTION_HEADER.exec(line);
    if (m && !KEY_LINE.test(line) && line.length <= 48) {
      const slide = SECTION_SLIDE.exec(m[1].trim());
      if (slide) {
        if (!sawSlide) {
          out.push("slides:");
          sawSlide = true;
        }
        out.push(`${slide[1]}) `);
        continue;
      }
      out.push(`${m[1].trim().toLowerCase().replace(/[\s/&]+/g, "_")}:`);
      continue;
    }
    out.push(raw);
  }
  return out;
}

/** `key: value` 줄들을 객체로. 값이 없는 키 다음 줄들(본문·리스트)은 그 키에 붙는다. */
function parseKeyValueBlock(lines: string[]): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  let current: string | null = null;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      if (current && typeof out[current] === "string") out[current] = `${out[current]}\n`;
      continue;
    }
    const li = LIST_ITEM.exec(line);
    if (li && current) {
      const prev = out[current];
      if (Array.isArray(prev)) prev.push(li[1].trim());
      else if (!prev || prev === "" || prev === "\n") out[current] = [li[1].trim()];
      else out[current] = `${prev}\n${line.trim()}`;
      continue;
    }
    const kv = KEY_LINE.exec(line);
    if (kv && !line.startsWith(" ") && !line.startsWith("\t")) {
      current = kv[1].trim().toLowerCase().replace(/[\s/]+/g, "_");
      out[current] = kv[2].trim();
      continue;
    }
    if (current) {
      const prev = out[current];
      out[current] = Array.isArray(prev) ? [...prev, line.trim()] : `${prev ?? ""}${prev && !String(prev).endsWith("\n") ? "\n" : ""}${line.trim()}`;
    }
  }
  for (const k of Object.keys(out)) if (typeof out[k] === "string") out[k] = (out[k] as string).trim();
  return out;
}

export function parseLooseDraft(text: string): ParsedInboxDoc {
  const lines = normalizeSectionHeaders(text.replace(/\r\n?/g, "\n").split("\n"));
  const slidesAt = lines.findIndex((l) => /^slides\s*:\s*$/i.test(l.trim()));
  const headerLines = slidesAt >= 0 ? lines.slice(0, slidesAt) : lines;
  const slideLines = slidesAt >= 0 ? lines.slice(slidesAt + 1) : [];

  // 슬라이드 블록: "1) role: x" 로 시작해 다음 번호 전까지. 슬라이드가 아닌 최상위 키(caption: 등)가 나오면 그 뒤는 꼬리 블록.
  const blocks: string[][] = [];
  const tail: string[] = [];
  let cur: string[] | null = null;
  let inTail = false;
  for (const l of slideLines) {
    if (inTail) {
      tail.push(l);
      continue;
    }
    const m = SLIDE_START.exec(l);
    if (m) {
      cur = [m[2]];
      blocks.push(cur);
      continue;
    }
    if (cur && !l.startsWith(" ") && KEY_LINE.test(l.trim()) && !SLIDE_KEYS.test(l.trim())) {
      inTail = true;
      tail.push(l);
      continue;
    }
    if (cur) cur.push(l);
  }
  // 머리 블록이 우선, 꼬리 블록(caption·source_urls 가 슬라이드 뒤에 오는 형식)은 빈 키만 채운다
  const header = { ...parseKeyValueBlock(tail), ...parseKeyValueBlock(headerLines) };
  const total = blocks.length;
  const slides: ParsedSlide[] = blocks.map((b, i) => {
    const o = parseKeyValueBlock(b);
    const norm: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) norm[k] = Array.isArray(v) ? v.map((x) => `- ${x}`).join("\n") : v;
    return { index: i + 1, role: normalizeRole(str(norm.role), i + 1, total), text: slideText(norm) };
  });

  const s = (k: string) => (typeof header[k] === "string" ? (header[k] as string) : Array.isArray(header[k]) ? (header[k] as string[]).join("\n") : undefined);
  const fm: InboxFrontMatter = {
    channel: s("channel")?.toLowerCase().replace(/^@/, ""),
    content_type: total > 1 ? "carousel" : total === 1 ? "single" : undefined,
    topic: s("topic"),
    headline: s("headline")?.replace(/\\n/g, "\n"),
    hashtags: splitHashtags(header.hashtags),
    sources: toSources(header.source_urls ?? header.sources),
    visual_direction: s("editorial_angle") ?? s("angle"),
  };
  const problems: string[] = [];
  if (slidesAt < 0) problems.push("no 'slides:' section");
  return finish(fm, slides, s("caption") ?? "", problems);
}
