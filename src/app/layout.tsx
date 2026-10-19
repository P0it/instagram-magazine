import type { Metadata, Viewport } from "next";
import {
  Anton, Bebas_Neue, Black_Han_Sans, DM_Serif_Display, Do_Hyeon, Dongle, Gaegu, Gowun_Batang, Gowun_Dodum, IBM_Plex_Sans_KR, Jua,
  Nanum_Myeongjo, Nanum_Pen_Script, Noto_Sans_KR, Noto_Serif_KR, Playfair_Display, Song_Myung, Space_Grotesk, Yeon_Sung,
} from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/shell/providers";

// next/font 로 self-host. 렌더 폰트와 UI 폰트를 같은 파일에서 쓴다.
const sansKr = Noto_Sans_KR({
  variable: "--font-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
  display: "swap",
});

const serifKr = Noto_Serif_KR({
  variable: "--font-serif-kr",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

// 캔버스 표현용 한글 폰트 5종 (레이어 단위 선택). 전부 self-host 라 내보내기가 결정적이다.
const nanumMyeongjo = Nanum_Myeongjo({ variable: "--font-nanum-myeongjo", weight: ["400", "700"], display: "swap" });
const songMyung = Song_Myung({ variable: "--font-song-myung", weight: "400", display: "swap" });
const gowunDodum = Gowun_Dodum({ variable: "--font-gowun-dodum", weight: "400", display: "swap" });
const blackHanSans = Black_Han_Sans({ variable: "--font-black-han-sans", weight: "400", display: "swap" });
const gaegu = Gaegu({ variable: "--font-gaegu", weight: ["400", "700"], display: "swap" });
const gowunBatang = Gowun_Batang({ variable: "--font-gowun-batang", weight: ["400", "700"], display: "swap" });
const ibmPlexSansKr = IBM_Plex_Sans_KR({ variable: "--font-ibm-plex-sans-kr", weight: ["400", "500", "700"], display: "swap" });
const doHyeon = Do_Hyeon({ variable: "--font-do-hyeon", weight: "400", display: "swap" });
const jua = Jua({ variable: "--font-jua", weight: "400", display: "swap" });
const yeonSung = Yeon_Sung({ variable: "--font-yeon-sung", weight: "400", display: "swap" });
const dongle = Dongle({ variable: "--font-dongle", weight: ["300", "400", "700"], display: "swap" });
const nanumPen = Nanum_Pen_Script({ variable: "--font-nanum-pen", weight: "400", display: "swap" });
// 영문 디스플레이 폰트 — 한글은 폴백(산세리프)으로 떨어진다
const playfair = Playfair_Display({ variable: "--font-playfair-display", subsets: ["latin"], display: "swap" });
const dmSerifDisplay = DM_Serif_Display({ variable: "--font-dm-serif-display", subsets: ["latin"], weight: "400", display: "swap" });
const bebasNeue = Bebas_Neue({ variable: "--font-bebas-neue", subsets: ["latin"], weight: "400", display: "swap" });
const anton = Anton({ variable: "--font-anton", subsets: ["latin"], weight: "400", display: "swap" });
const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"], display: "swap" });
const canvasFonts = [
  nanumMyeongjo, songMyung, gowunDodum, blackHanSans, gaegu, gowunBatang, ibmPlexSansKr, doHyeon, jua, yeonSung, dongle, nanumPen,
  playfair, dmSerifDisplay, bebasNeue, anton, spaceGrotesk,
].map((f) => f.variable).join(" ");

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME ?? "Magazine Desk",
  description: "1인용 Instagram 매거진 에디토리얼 데스크",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${sansKr.variable} ${serifKr.variable} ${canvasFonts} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Montage(Wanted DS) UI 폰트 — Pretendard Variable(본문) + Wanted Sans Variable(디스플레이) */}
        <link rel="preconnect" href="https://static.wanted.co.kr" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://static.wanted.co.kr/fonts/pretendard/pretendard/pretendardvariable-dynamic-subset.min.css" />
        <link rel="stylesheet" href="https://static.wanted.co.kr/fonts/wantedsans/WantedSansVariable.min.css" />
      </head>
      <body className="min-h-full flex flex-col">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
