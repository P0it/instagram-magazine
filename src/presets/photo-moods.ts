import type { StockProvider } from "@/types";

/**
 * 사진 탭의 무드 칩 — 큐레이터·에디터가 배경으로 쓰는 톤을 검색어로 옮긴 것.
 * `q` 는 Pexels/Unsplash(영문 검색이 잘 맞음), `art` 는 퍼블릭 도메인 미술관(빈티지 판화·포스터·회화) 용.
 */
export interface PhotoMood {
  id: string;
  label: string;
  hint: string;
  q: string;
  art: string;
}

export const PHOTO_MOODS: PhotoMood[] = [
  { id: "film", label: "필름 스냅", hint: "그레인·약간 흔들린 일상", q: "35mm film street snapshot grain", art: "street scene crowd" },
  { id: "flash", label: "직찍 플래시", hint: "정면 플래시, 날것의 밤", q: "direct flash night photography candid", art: "night lantern" },
  { id: "kitsch", label: "키치·팝", hint: "원색, 과한 소품, 촌스러워서 힙한", q: "kitsch pop colorful still life", art: "colorful poster" },
  { id: "humor", label: "유머·엉뚱", hint: "생활 오브제를 비틀어 놓은 컷", q: "funny surreal everyday object minimal", art: "cat humor" },
  { id: "satire", label: "해학·풍자", hint: "옛 풍자화·캐리커처 톤", q: "vintage caricature illustration", art: "caricature satire" },
  { id: "retro", label: "레트로 90s", hint: "빈티지 가정·잡지 질감", q: "retro 90s vintage interior", art: "vintage poster advertisement" },
  { id: "mono", label: "흑백 에디토리얼", hint: "대비 강한 흑백 인물·건축", q: "black and white editorial portrait", art: "black and white photograph" },
  { id: "still", label: "정물·오브제", hint: "한 점만 놓은 여백 있는 정물", q: "still life object minimal shadow", art: "still life" },
  { id: "texture", label: "질감·종이", hint: "종이·천·벽, 글자 얹기 좋은 면", q: "paper texture wrinkled aesthetic background", art: "textile pattern" },
  { id: "dawn", label: "새벽·도시", hint: "푸르스름한 도시, 빈 거리", q: "blue hour empty city street moody", art: "city night" },
  { id: "nature", label: "자연 무드", hint: "흐린 날·안개·낮은 채도", q: "foggy muted nature moody landscape", art: "landscape mist" },
  { id: "fashion", label: "패션 에디토리얼", hint: "잡지 화보 같은 포즈와 구도", q: "fashion editorial street style", art: "portrait fashion" },
];

export function moodQuery(m: PhotoMood, provider: StockProvider | undefined): string {
  return provider === "artic" ? m.art : m.q;
}

export const PROVIDER_LABEL: Record<StockProvider, string> = {
  pexels: "Pexels",
  unsplash: "Unsplash",
  artic: "시카고 미술관 (퍼블릭 도메인)",
  library: "모아둔 사진",
};

export const PROVIDER_SHORT: Record<StockProvider, string> = { pexels: "Pexels", unsplash: "Unsplash", artic: "Art Institute", library: "모아둔 사진" };
