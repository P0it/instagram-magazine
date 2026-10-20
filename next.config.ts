import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // e2e 는 실제 dev 서버(:3100, 실 Drive)와 분리된 mock 서버를 따로 띄운다 — Next 16 은 distDir 당 dev 서버 1개
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // 기본 위치(왼쪽 아래)가 사이드바 계정 버튼을 가린다
  devIndicators: { position: "bottom-right" },
  cacheComponents: true,
  serverExternalPackages: ["googleapis"],
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default nextConfig;
