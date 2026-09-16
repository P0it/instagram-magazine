import { Suspense, type ReactNode } from "react";
import { TopBar } from "@/components/shell/top-bar";

export default function DeskLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-surface-alt">
      <Suspense fallback={<div className="h-14 shrink-0 bg-surface" />}>
        <TopBar />
      </Suspense>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Suspense>{children}</Suspense>
      </main>
    </div>
  );
}
