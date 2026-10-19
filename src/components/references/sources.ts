/** 레퍼런스를 찾으러 가는 곳 — 외부 링크 모음. 자동 수집이 아니라 "여기서 찾아 보드에 저장" 용도 */
export interface RefSource {
  name: string;
  url: string;
  desc: string;
}

export interface RefSourceGroup {
  title: string;
  hint: string;
  items: RefSource[];
}

export const REF_SOURCE_GROUPS: RefSourceGroup[] = [
  {
    title: "디자인 레퍼런스",
    hint: "피드 레이아웃·타이포·스티커 아이디어",
    items: [
      { name: "Pinterest", url: "https://www.pinterest.com/", desc: "무드보드·이미지 검색의 기본. '카페 인스타 피드', '카드뉴스 타이포'로 검색" },
      { name: "Behance", url: "https://www.behance.net/", desc: "프로젝트 단위 포트폴리오 — 브랜딩·소셜 캠페인 사례" },
      { name: "Dribbble", url: "https://dribbble.com/", desc: "비주얼 샷 중심. 타이포·컬러 감각 참고" },
      { name: "Designspiration", url: "https://www.designspiration.com/", desc: "색상·스타일로 레퍼런스를 걸러 볼 수 있어요" },
      { name: "Savee", url: "https://savee.com/", desc: "큐레이션된 영감 저장소" },
      { name: "Cosmos", url: "https://www.cosmos.so/", desc: "취향 기반 무드보드 큐레이션" },
      { name: "Are.na", url: "https://www.are.na/", desc: "레퍼런스를 채널로 모으는 아카이브" },
      { name: "Mobbin", url: "https://mobbin.com/", desc: "앱 UI·플로우 라이브러리 (인터페이스 참고용)" },
      { name: "Awwwards", url: "https://www.awwwards.com/", desc: "웹·모션 수상작 — 움직임 아이디어" },
    ],
  },
  {
    title: "국내",
    hint: "한국 디자이너·템플릿 감각",
    items: [
      { name: "노트폴리오", url: "https://notefolio.net/", desc: "국내 디자이너 포트폴리오 플랫폼" },
      { name: "미리캔버스 템플릿", url: "https://www.miricanvas.com/", desc: "국내 카드뉴스·SNS 템플릿 트렌드 확인" },
      { name: "Canva 카드뉴스", url: "https://www.canva.com/ko_kr/create/card-news/", desc: "카드뉴스 구성(표지→본문→CTA) 흐름 참고" },
    ],
  },
  {
    title: "색 조합",
    hint: "배경 + 글자 색을 정할 때",
    items: [
      { name: "Coolors", url: "https://coolors.co/", desc: "팔레트 생성·탐색, 이미지에서 색 추출" },
      { name: "Color Hunt", url: "https://colorhunt.co/", desc: "큐레이션된 4색 팔레트 모음" },
      { name: "Adobe Color", url: "https://color.adobe.com/", desc: "색상환·조화 규칙으로 조합 만들기" },
    ],
  },
];
