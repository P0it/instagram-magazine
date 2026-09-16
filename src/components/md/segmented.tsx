"use client";

import { cn } from "@/lib/utils";

export interface SegmentItem<V extends string> {
  value: V;
  label: React.ReactNode;
}

/** Montage SegmentedControl — fill-alternative 트랙 위 흰 선택 칩 + xsmall 그림자 */
export function Segmented<V extends string>({
  items,
  value,
  onChange,
  size = "small",
  className,
}: {
  items: readonly (SegmentItem<V> | V)[];
  value: V;
  onChange: (v: V) => void;
  size?: "small" | "medium";
  className?: string;
}) {
  const list = items.map((i) => (typeof i === "string" ? { value: i, label: i } : i));
  return (
    <div
      role="tablist"
      className={cn("grid w-full rounded-lg bg-fill-alt p-[3px]", size === "medium" ? "h-10 rounded-[10px]" : "h-8", className)}
      style={{ gridTemplateColumns: `repeat(${list.length}, minmax(0, 1fr))` }}
    >
      {list.map((i) => {
        const on = i.value === value;
        return (
          <button
            key={i.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(i.value)}
            className={cn(
              "flex items-center justify-center whitespace-nowrap rounded-[7px] px-2 font-medium transition-colors duration-200",
              size === "medium" ? "text-sm" : "text-xs",
              on ? "bg-surface text-label shadow-e-xs" : "text-label-alt hover:text-label",
            )}
          >
            {i.label}
          </button>
        );
      })}
    </div>
  );
}
