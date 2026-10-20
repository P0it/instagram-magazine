export type NavKey = "references" | "templates" | "create" | "queue" | "settings";

export const NAV_ITEMS: readonly { key: NavKey; label: string; href: string }[] = [
  { key: "references", label: "레퍼런스", href: "/references" },
  { key: "templates", label: "템플릿", href: "/templates" },
  { key: "create", label: "콘텐츠 만들기", href: "/home" },
  { key: "queue", label: "게시 큐", href: "/queue" },
  { key: "settings", label: "설정", href: "/settings" },
];

/** "콘텐츠 만들기" 에 속하는 경로 (홈 보드 · 라이브러리 · 대시보드) */
const CREATE_PREFIXES = ["/home", "/library", "/dashboard"];

export function activeNavKey(pathname: string): NavKey | null {
  const hit = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
  if (hit("/references")) return "references";
  if (hit("/templates")) return "templates";
  if (hit("/queue")) return "queue";
  if (hit("/settings")) return "settings";
  if (CREATE_PREFIXES.some(hit)) return "create";
  return null;
}
