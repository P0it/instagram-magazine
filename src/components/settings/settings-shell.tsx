"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings/accounts", label: "Instagram 계정" },
  { href: "/settings/channels", label: "채널" },
  { href: "/settings/style-packs", label: "스타일팩" },
  { href: "/settings/drive", label: "Drive · 시스템" },
];

export function SettingsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      <PageHeader title="설정" description="모든 설정은 Drive 의 _system/*.json 과 환경변수에 저장됩니다." />
      <div className="flex gap-1 border-b border-border px-6">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className={cn("-mb-px border-b-2 px-3 py-2.5 text-sm", pathname === t.href ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
          </Link>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
    </>
  );
}
