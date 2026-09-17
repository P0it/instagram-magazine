"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { stageBadge } from "@/lib/metadata/stage";
import type { PostStatus } from "@/types";

/** Montage ContentBadge (accent) — 3단계 파이프라인 라벨 */
export function StageBadge({ status, touched, className }: { status: PostStatus; touched: boolean; className?: string }) {
  const b = stageBadge(status, touched);
  const tone: Record<typeof b.tone, string> = {
    neutral: "bg-fill text-label-neutral",
    blue: "bg-[var(--semantic-primary-normal)]/10 text-[var(--semantic-accent-foreground-blue)]",
    green: "bg-[var(--semantic-background-status-positive)] text-[var(--semantic-accent-foreground-green)]",
    red: "bg-[var(--semantic-background-status-negative)] text-negative",
    cautionary: "bg-[var(--semantic-background-status-cautionary)] text-cautionary",
  };
  return (
    <span className={cn("inline-flex h-6 items-center whitespace-nowrap rounded-md px-2 text-xs font-semibold", tone[b.tone], className)}>
      {b.label}
    </span>
  );
}

/** 32px 무테 아이콘 버튼 (hover 시 fill-normal) */
export function GhostIcon({
  children,
  title,
  onClick,
  disabled,
  active,
  className,
  danger,
}: {
  children: ReactNode;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid size-8 place-items-center rounded-lg text-label-neutral transition-colors duration-150 disabled:opacity-30",
        active ? "bg-fill text-brand" : danger ? "hover:bg-[var(--semantic-background-status-negative)] hover:text-negative" : "hover:bg-fill",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** 텍스트 칩 버튼 — 캔버스 하단 컨트롤/줌 칩 */
export function ChipButton({ children, on, onClick, title, className }: { children: ReactNode; on?: boolean; onClick?: () => void; title?: string; className?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "h-[26px] shrink-0 whitespace-nowrap rounded-lg px-2.5 text-xs font-semibold transition-colors hover:bg-fill",
        on ? "bg-fill text-label" : "text-label-alt",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** 패널 섹션 라벨 (12px semibold, label-alternative) */
export function PanelLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs font-semibold text-label-alt">{children}</span>
      {right}
    </div>
  );
}

/** 접이식 섹션 — 목업의 chevron 회전 300ms */
export function Collapsible({ title, summary, defaultOpen = false, children }: { title: ReactNode; summary?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="flex flex-col gap-1.5 pb-2.5" style={{ boxShadow: "inset 0 -1px 0 var(--semantic-line-solid-alternative)" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center justify-between gap-2 py-0.5 text-left">
        <span className="text-xs font-semibold text-label-alt">{title}</span>
        <span className="flex items-center gap-1.5 text-[11px] text-label-assistive">
          {summary}
          <ChevronDown className="size-4 opacity-50 transition-transform duration-300" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transitionTimingFunction: "cubic-bezier(0.25,0.1,0.25,1)" }} />
        </span>
      </button>
      {open && children}
    </div>
  );
}

/** 라벨 + 값 + range 슬라이더 한 줄 */
export function RangeRow({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  hint,
  onHint,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  hint?: string;
  onHint?: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-label-alt">{label}</span>
        <span className="text-[13px] font-semibold tabular-nums">{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={rangeStyle(value, min, max)} />
      {hint && onHint && (
        <button type="button" onClick={onHint} className="self-start rounded-md bg-fill-alt px-2.5 py-[3px] text-[11px] text-label-alt hover:bg-fill">
          {hint}
        </button>
      )}
    </div>
  );
}

/** 슬라이더 채움 비율 — globals.css 의 input[type=range] 트랙이 --range-pct 로 그린다 */
export function rangeStyle(value: number, min: number, max: number): React.CSSProperties {
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  return { "--range-pct": `${Math.max(0, Math.min(100, pct))}%` } as React.CSSProperties;
}

/** 색 팔레트 그리드 + 직접 고르기 */
export const PALETTE = ["#FFFFFF", "#F7F7F8", "#989BA2", "#171719", "#FF5E00", "#F55A00", "#D17600", "#429E00", "#009632", "#0098B2", "#0066FF", "#5B37ED", "#AD36E3", "#E846CD", "#E52222"];

export function PaletteGrid({ value, onChange, extra }: { value: string; onChange: (c: string) => void; extra?: string }) {
  const list = extra && !PALETTE.includes(extra.toUpperCase()) ? [...PALETTE, extra] : PALETTE;
  const cur = value.toUpperCase();
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-8 gap-1.5">
        {list.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => onChange(c)}
            className="aspect-square rounded-full"
            style={{ background: c, boxShadow: cur === c.toUpperCase() ? "0 0 0 2px var(--semantic-primary-normal), inset 0 0 0 1px rgba(23,23,25,0.14)" : "inset 0 0 0 1px rgba(23,23,25,0.14)" }}
          />
        ))}
      </div>
      <label className="flex cursor-pointer items-center gap-2.5 rounded-[10px] bg-fill-alt px-2.5 py-2">
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#0066FF"} onChange={(e) => onChange(e.target.value.toUpperCase())} className="size-7 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
        <span className="text-[13px] font-semibold">직접 고르기</span>
        <span className="flex-1" />
        <span className="text-xs tabular-nums text-label-alt">{value}</span>
      </label>
    </div>
  );
}

/** Montage 텍스트 입력 — 12px 라운드, inset hairline, focus 시 primary 2px */
export const fieldClass =
  "w-full rounded-xl border-0 bg-fill-alt px-3 py-[11px] text-sm text-label outline-none hairline placeholder:text-label-assistive focus:[box-shadow:inset_0_0_0_2px_var(--semantic-primary-normal)]";
