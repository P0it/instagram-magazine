"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { Segmented } from "@/components/md/segmented";

const TABS = [
  { href: "/settings/accounts", label: "계정 · 채널" },
  { href: "/settings/drive", label: "Google Drive" },
  { href: "/settings/style-packs", label: "스타일팩" },
] as const;

/** 목업 S-05 설정: 720px 중앙 컬럼, 섹션 카드 */
export function SettingsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const current = TABS.find((t) => pathname === t.href)?.href ?? TABS[0].href;
  return (
    <div className="mx-auto box-border flex w-full max-w-[760px] flex-1 flex-col gap-7 overflow-y-auto px-5 pb-24 pt-8" style={{ scrollbarGutter: "stable" }}>
      <div className="flex items-center gap-2.5">
        <Link href="/home" className="grid size-8 place-items-center rounded-full hover:bg-fill" title="홈으로"><ChevronLeft className="size-5 opacity-70" /></Link>
        <h1 className="m-0 text-2xl font-bold leading-8 tracking-[-0.023em]">설정</h1>
      </div>
      <Segmented size="medium" value={current} onChange={(href) => router.push(href)} items={TABS.map((t) => ({ value: t.href, label: t.label }))} />
      {children}
    </div>
  );
}

export function SettingsSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="shrink-0 overflow-hidden rounded-2xl bg-surface">
      <div className="px-5 pb-2.5 pt-[18px]">
        <h2 className="m-0 text-[17px] font-semibold">{title}</h2>
        {description && <p className="m-0 mt-1.5 text-[13px] text-label-alt">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function SettingsRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3.5 px-5 py-3.5" style={{ boxShadow: "inset 0 1px 0 var(--semantic-line-solid-alternative)" }}>
      {children}
    </div>
  );
}
