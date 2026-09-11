import type { InboxGroup } from "@/types";

export interface InboxFileLike {
  id: string;
  name: string;
  mimeType: string;
}

const PREFIX_RE = /^(\d{4}-\d{2}-\d{2})_([a-z0-9가-힣][a-z0-9가-힣-]*?)(?:_(\d+))?\.([a-z0-9]+)$/i;
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp"]);
const TEXT_EXT = new Set(["md", "markdown", "txt"]);

/**
 * inbox 파일들을 `YYYY-MM-DD_slug` 접두로 묶는다.
 * 이미지는 `_N` 접미로 순서. 접두가 없는 파일은 파일명(확장자 제외)을 접두로 취급.
 */
export function groupInboxFiles(files: InboxFileLike[]): InboxGroup[] {
  const groups = new Map<string, InboxGroup>();

  const ensure = (prefix: string, date: string | null, slug: string): InboxGroup => {
    let g = groups.get(prefix);
    if (!g) {
      g = { prefix, date, slug, markdownFileId: null, imageFileIds: [], otherFileIds: [] };
      groups.set(prefix, g);
    }
    return g;
  };

  for (const f of files) {
    if (f.mimeType === "application/vnd.google-apps.folder") continue;
    if (f.name.startsWith(".")) continue;
    const m = PREFIX_RE.exec(f.name);
    let prefix: string;
    let date: string | null;
    let slug: string;
    let order = 0;
    let ext: string;
    if (m) {
      date = m[1];
      slug = m[2];
      prefix = `${date}_${slug}`;
      order = m[3] ? Number(m[3]) : 0;
      ext = m[4].toLowerCase();
    } else {
      const dot = f.name.lastIndexOf(".");
      const base = dot > 0 ? f.name.slice(0, dot) : f.name;
      ext = dot > 0 ? f.name.slice(dot + 1).toLowerCase() : "";
      const im = /^(.*?)_(\d+)$/.exec(base);
      prefix = im ? im[1] : base;
      slug = prefix;
      date = null;
      order = im ? Number(im[2]) : 0;
    }
    const g = ensure(prefix, date, slug);
    if (TEXT_EXT.has(ext) || f.mimeType === "text/markdown") {
      if (!g.markdownFileId) g.markdownFileId = f.id;
      else g.otherFileIds.push({ fileId: f.id, name: f.name });
    } else if (IMAGE_EXT.has(ext) || f.mimeType.startsWith("image/")) {
      g.imageFileIds.push({ fileId: f.id, name: f.name, order });
    } else {
      g.otherFileIds.push({ fileId: f.id, name: f.name });
    }
  }

  for (const g of groups.values()) {
    g.imageFileIds.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }
  return [...groups.values()].sort((a, b) => a.prefix.localeCompare(b.prefix));
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60) || "untitled";
}
