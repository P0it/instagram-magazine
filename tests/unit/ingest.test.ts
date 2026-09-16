import { describe, expect, it } from "vitest";
import { parseInboxMarkdown } from "@/lib/ingest/parse-md";
import { groupInboxFiles, slugify } from "@/lib/ingest/group";

const SAMPLE = `---
channel: life
content_type: carousel
topic: 청년 월세 지원
headline: "월세 내고 있다면\\n이번 주 이건 확인"
hashtags: [청년정책, 월세지원]
sources:
  - {title: "안내", url: "https://x", publisher: "정부", source_type: official}
visual_direction: "quiet editorial"
---
## slide 1 (cover)
월세 내고 있다면
이번 주 이건 확인
## slide 2 (info)
본문
두 줄
## slide 3 (closing)
저장하세요
## caption
캡션 본문
`;

describe("parseInboxMarkdown", () => {
  it("parses front-matter, slides, caption", () => {
    const d = parseInboxMarkdown(SAMPLE);
    expect(d.frontMatter.channel).toBe("life");
    expect(d.frontMatter.headline).toBe("월세 내고 있다면\n이번 주 이건 확인");
    expect(d.frontMatter.hashtags).toEqual(["청년정책", "월세지원"]);
    expect(d.frontMatter.sources?.[0]?.source_type).toBe("official");
    expect(d.slides).toHaveLength(3);
    expect(d.slides.map((s) => s.role)).toEqual(["cover", "info", "closing"]);
    expect(d.slides[1].text).toBe("본문\n두 줄");
    expect(d.caption).toBe("캡션 본문");
    expect(d.problems).toEqual([]);
  });
  it("handles hashtags as string and missing roles", () => {
    const d = parseInboxMarkdown(`---\nhashtags: "#a, b c"\n---\n## slide 1\nA\n## slide 2\nB\n## slide 3\nC\n## caption\nx`);
    expect(d.frontMatter.hashtags).toEqual(["a", "b", "c"]);
    expect(d.slides.map((s) => s.role)).toEqual(["cover", "info", "closing"]);
    expect(d.frontMatter.headline).toBe("A");
  });
  it("no headings → single cover slide with problems", () => {
    const d = parseInboxMarkdown("그냥 텍스트");
    expect(d.slides).toHaveLength(1);
    expect(d.slides[0].role).toBe("cover");
    expect(d.problems.some((p) => p.includes("slide"))).toBe(true);
    expect(d.problems.some((p) => p.includes("caption"))).toBe(true);
  });
  it("invalid front-matter keeps valid keys", () => {
    const d = parseInboxMarkdown(`---\nchannel: "NO PE"\ntopic: ok\n---\n## slide 1 (cover)\nT\n## caption\nc`);
    expect(d.frontMatter.channel).toBeUndefined();
    expect(d.frontMatter.topic).toBe("ok");
    expect(d.problems.some((p) => p.includes("front-matter invalid"))).toBe(true);
  });
});

describe("groupInboxFiles", () => {
  it("groups by prefix and orders images", () => {
    const g = groupInboxFiles([
      { id: "a", name: "2026-09-12_free-health-checkup.md", mimeType: "text/markdown" },
      { id: "b", name: "2026-09-12_free-health-checkup_2.png", mimeType: "image/png" },
      { id: "c", name: "2026-09-12_free-health-checkup_1.png", mimeType: "image/png" },
      { id: "d", name: "2026-09-12_other.md", mimeType: "text/markdown" },
      { id: "e", name: "notes.txt", mimeType: "text/plain" },
      { id: "f", name: "sub", mimeType: "application/vnd.google-apps.folder" },
    ]);
    expect(g).toHaveLength(3);
    const first = g.find((x) => x.prefix === "2026-09-12_free-health-checkup")!;
    expect(first.date).toBe("2026-09-12");
    expect(first.slug).toBe("free-health-checkup");
    expect(first.markdownFileId).toBe("a");
    expect(first.imageFileIds.map((i) => i.fileId)).toEqual(["c", "b"]);
    const loose = g.find((x) => x.prefix === "notes")!;
    expect(loose.date).toBeNull();
    expect(loose.markdownFileId).toBe("e");
  });
  it("slugify", () => {
    expect(slugify("Hello World! 청년")).toBe("hello-world-청년");
    expect(slugify("")).toBe("untitled");
  });
});
