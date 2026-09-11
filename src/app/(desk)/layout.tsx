import { Suspense, type ReactNode } from "react";
import { Sidebar } from "@/components/shell/sidebar";

export default function DeskLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <Suspense fallback={<div className="w-60 shrink-0 border-r border-border bg-sidebar" />}>
        <Sidebar />
      </Suspense>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Suspense>{children}</Suspense>
      </main>
    </div>
  );
}
