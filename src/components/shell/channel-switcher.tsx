"use client";

import { CHANNEL_KEYS, type ChannelKey } from "@/types";
import { cn } from "@/lib/utils";
import { CHANNEL_META, useChannel } from "@/lib/client/channel";

export function ChannelSwitcher({ compact = false }: { compact?: boolean }) {
  const [current, setChannel] = useChannel();
  return (
    <div className={cn("grid gap-1 rounded-xl bg-muted/60 p-1", compact ? "grid-cols-5" : "grid-cols-5")}>
      <ChannelPill active={current === null} label="ALL" color="#525252" onClick={() => setChannel(null)} />
      {CHANNEL_KEYS.map((ch) => (
        <ChannelPill key={ch} active={current === ch} label={CHANNEL_META[ch].short} color={CHANNEL_META[ch].color} onClick={() => setChannel(ch)} />
      ))}
    </div>
  );
}

function ChannelPill({ active, label, color, onClick }: { active: boolean; label: string; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 items-center justify-center rounded-lg text-[11px] font-semibold tracking-wide transition-all",
        active ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
      style={active ? { boxShadow: `inset 0 -2px 0 ${color}` } : undefined}
    >
      {label}
    </button>
  );
}

export function ChannelDot({ channel, className }: { channel: ChannelKey; className?: string }) {
  return <span className={cn("inline-block size-2 rounded-full", className)} style={{ background: CHANNEL_META[channel].color }} />;
}
