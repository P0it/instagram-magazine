import matter from "gray-matter";
import {
  InboxFrontMatterSchema,
  SlideRoleSchema,
  type InboxFrontMatter,
  type ParsedInboxDoc,
  type ParsedSlide,
  type SlideRole,
} from "@/types";

const SLIDE_HEADING = /^##\s*slide\s*(\d+)\s*(?:\(([^)]*)\))?\s*$/i;
const CAPTION_HEADING = /^##\s*caption\s*$/i;

function normalizeRole(raw: string | undefined, index: number, total: number): SlideRole {
  const r = (raw ?? "").trim().toLowerCase();
  const parsed = SlideRoleSchema.safeParse(r);
  if (parsed.success) return parsed.data;
  if (r.includes("cover") || r.includes("title")) return "cover";
  if (r.includes("quote")) return "quote";
  if (r.includes("shot")) return "screenshot";
  if (r.includes("photo") || r.includes("image")) return "photo";
  if (r.includes("clos") || r.includes("cta") || r.includes("end")) return "closing";
  if (index === 1) return "cover";
  if (total > 1 && index === total) return "closing";
  return "info";
}

/** ChatGPT 산출 .md → front-matter + 슬라이드 + 캡션. 실패해도 최대한 부분 파싱. */
export function parseInboxMarkdown(source: string): ParsedInboxDoc {
  const problems: string[] = [];
  let data: unknown = {};
  let content = source;
  try {
    const fm = matter(source);
    data = fm.data;
    content = fm.content;
  } catch (e) {
    problems.push(`front-matter parse error: ${String(e)}`);
  }

  const fmResult = InboxFrontMatterSchema.safeParse(coerceFrontMatter(data));
  let frontMatter: InboxFrontMatter = {};
  if (fmResult.success) {
    frontMatter = fmResult.data;
  } else {
    problems.push(`front-matter invalid: ${fmResult.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`);
    const loose = InboxFrontMatterSchema.partial().safeParse(pickValidKeys(data));
    if (loose.success) frontMatter = loose.data;
  }

  const lines = content.split(/\r?\n/);
  type Section = { kind: "slide"; index: number; role?: string; lines: string[] } | { kind: "caption"; lines: string[] };
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const line of lines) {
    const s = SLIDE_HEADING.exec(line.trim());
    if (s) {
      current = { kind: "slide", index: Number(s[1]), role: s[2], lines: [] };
      sections.push(current);
      continue;
    }
    if (CAPTION_HEADING.test(line.trim())) {
      current = { kind: "caption", lines: [] };
      sections.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }

  const slideSections = sections.filter((s): s is Extract<Section, { kind: "slide" }> => s.kind === "slide");
  const total = slideSections.length;
  const slides: ParsedSlide[] = slideSections
    .sort((a, b) => a.index - b.index)
    .map((s, i) => ({
      index: i + 1,
      role: normalizeRole(s.role, i + 1, total),
      text: s.lines.join("\n").trim(),
    }));

  const captionSection = sections.find((s) => s.kind === "caption");
  const caption = captionSection ? captionSection.lines.join("\n").trim() : "";

  if (slides.length === 0) {
    // 헤딩이 전혀 없으면 본문 전체를 한 슬라이드로
    const body = content.trim();
    if (body) slides.push({ index: 1, role: "cover", text: body });
    problems.push("no '## slide N' headings found");
  }
  if (!caption) problems.push("no '## caption' section");
  if (!frontMatter.headline) {
    const first = slides[0]?.text.split("\n")[0]?.trim();
    if (first) frontMatter = { ...frontMatter, headline: first };
    else problems.push("headline missing");
  }

  return { frontMatter, slides, caption, problems };
}

/** YAML 이 느슨하게 와도 최대한 맞춰준다 (hashtags 문자열 → 배열 등). */
function coerceFrontMatter(data: unknown): unknown {
  if (!data || typeof data !== "object") return {};
  const d = { ...(data as Record<string, unknown>) };
  if (typeof d.hashtags === "string") {
    d.hashtags = d.hashtags
      .split(/[\s,]+/)
      .map((h) => h.replace(/^#/, "").trim())
      .filter(Boolean);
  }
  if (Array.isArray(d.hashtags)) {
    d.hashtags = d.hashtags.map((h) => String(h).replace(/^#/, "").trim()).filter(Boolean);
  }
  if (typeof d.channel === "string") d.channel = d.channel.toUpperCase();
  if (typeof d.content_type === "string") d.content_type = d.content_type.toLowerCase();
  if (typeof d.headline === "string") d.headline = d.headline.replace(/\\n/g, "\n");
  return d;
}

function pickValidKeys(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object") return {};
  const out: Record<string, unknown> = {};
  const shape = InboxFrontMatterSchema.shape;
  for (const [k, v] of Object.entries(coerceFrontMatter(data) as Record<string, unknown>)) {
    const field = shape[k as keyof typeof shape];
    if (field && field.safeParse(v).success) out[k] = v;
  }
  return out;
}
