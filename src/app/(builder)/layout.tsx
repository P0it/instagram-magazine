import { Suspense, type ReactNode } from "react";

/** 빌더(S-02)는 자체 헤더를 가지므로 상단 바 없음 */
export default function BuilderLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-surface-alt">
      <Suspense>{children}</Suspense>
    </div>
  );
}
