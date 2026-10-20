import { Suspense, type ReactNode } from "react";
import { Sidebar } from "@/components/shell/sidebar";

export default function DeskLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-surface-alt">
      <Suspense fallback={<aside className="w-[72px] shrink-0 border-r border-line lg:w-[244px]" />}>
        <Sidebar />
      </Suspense>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Suspense>{children}</Suspense>
      </main>
    </div>
  );
}
