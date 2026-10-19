/**
 * 색 조합 — 배경·글자·포인트 3색. 폰트와 색 조합만으로도 콘텐츠가 서는 에디토리얼 스타일용.
 * text 는 bg 위에서 읽히는 색(대비 우선), accent 는 스티커·도형 포인트.
 */
export interface ColorCombo {
  id: string;
  name: string;
  bg: string;
  text: string;
  accent: string;
  tags: string[];
}

export const COLOR_COMBOS: ColorCombo[] = [
  { id: "navy-mint", name: "네이비 × 민트", bg: "#0B1F3A", text: "#5EEAD4", accent: "#FFFFFF", tags: ["강렬", "모던"] },
  { id: "navy-neon", name: "네이비 × 형광 옐로", bg: "#0A1A3F", text: "#DFFF3D", accent: "#FFFFFF", tags: ["강렬", "트렌디"] },
  { id: "black-lime", name: "블랙 × 라임", bg: "#0A0A0A", text: "#C6FF00", accent: "#FFFFFF", tags: ["강렬", "트렌디"] },
  { id: "black-white", name: "블랙 × 화이트", bg: "#0A0A0A", text: "#FFFFFF", accent: "#FF4D2E", tags: ["미니멀"] },
  { id: "cream-green", name: "크림 × 딥그린", bg: "#F5F0E1", text: "#1F4D3A", accent: "#C46A2B", tags: ["내추럴", "카페"] },
  { id: "cream-brown", name: "크림 × 브라운", bg: "#F3EBDD", text: "#4A2E1F", accent: "#B8793F", tags: ["내추럴", "카페"] },
  { id: "offwhite-black", name: "오프화이트 × 블랙", bg: "#F5F5F2", text: "#111111", accent: "#FF4D2E", tags: ["미니멀", "에디토리얼"] },
  { id: "burgundy-cream", name: "버건디 × 크림", bg: "#5A1A25", text: "#F6E7D4", accent: "#E8A87C", tags: ["클래식", "무드"] },
  { id: "forest-lime", name: "포레스트 × 라임", bg: "#12372A", text: "#E4F27A", accent: "#FFFFFF", tags: ["내추럴", "트렌디"] },
  { id: "cobalt-white", name: "코발트 × 화이트", bg: "#1E40FF", text: "#FFFFFF", accent: "#FFE14D", tags: ["강렬", "모던"] },
  { id: "cobalt-pink", name: "코발트 × 핑크", bg: "#1E3AFF", text: "#FFB3E6", accent: "#FFFFFF", tags: ["키치", "트렌디"] },
  { id: "pink-black", name: "핫핑크 × 블랙", bg: "#FF3D9A", text: "#111111", accent: "#FFFFFF", tags: ["키치", "강렬"] },
  { id: "lavender-purple", name: "라벤더 × 딥퍼플", bg: "#D9CCFF", text: "#2B1B66", accent: "#FF6FB5", tags: ["파스텔", "감성"] },
  { id: "butter-black", name: "버터옐로 × 블랙", bg: "#FFE680", text: "#151515", accent: "#FF5A36", tags: ["키치", "밝음"] },
  { id: "terracotta-cream", name: "테라코타 × 크림", bg: "#C65D3B", text: "#FFF1E0", accent: "#2E2A25", tags: ["웜", "카페"] },
  { id: "sage-forest", name: "세이지 × 포레스트", bg: "#A8B5A0", text: "#1B2A1E", accent: "#F5F0E1", tags: ["내추럴", "차분"] },
  { id: "sky-navy", name: "스카이 × 네이비", bg: "#BFE3FF", text: "#0B2A5B", accent: "#FF6B1A", tags: ["파스텔", "산뜻"] },
  { id: "orange-navy", name: "오렌지 × 네이비", bg: "#FF6B1A", text: "#0B1F3A", accent: "#FFFFFF", tags: ["강렬", "밝음"] },
  { id: "mint-black", name: "민트 × 블랙", bg: "#A8F0D8", text: "#0A0A0A", accent: "#FF4D8D", tags: ["파스텔", "산뜻"] },
  { id: "charcoal-sand", name: "차콜 × 샌드", bg: "#26282B", text: "#E8D9BF", accent: "#C9A66B", tags: ["무드", "고급"] },
  { id: "wine-pink", name: "와인 × 핑크", bg: "#3B0F2A", text: "#FFC2D9", accent: "#FFFFFF", tags: ["무드", "감성"] },
  { id: "olive-cream", name: "올리브 × 크림", bg: "#4B5320", text: "#F4EFD8", accent: "#E0B84F", tags: ["내추럴", "빈티지"] },
  { id: "purple-lime", name: "일렉트릭 퍼플 × 라임", bg: "#5B2BFF", text: "#D7FF3A", accent: "#FFFFFF", tags: ["강렬", "트렌디"] },
  { id: "rose-brown", name: "로즈 × 딥브라운", bg: "#F4C9C9", text: "#4A1F1F", accent: "#B23A48", tags: ["파스텔", "감성"] },
];
