import type { VercelConfig } from "@vercel/config/v1";

// Hobby 플랜: 크론은 사용하지 않는다 (외부 핑거가 /api/cron/publish 를 호출).
export const config: VercelConfig = {
  framework: "nextjs",
};
