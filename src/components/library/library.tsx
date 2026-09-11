"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { POST_STATUSES, PostStatusSchema, type PostStatus } from "@/types";
import { usePosts } from "@/lib/client/queries";
import { CHANNEL_META, useChannel } from "@/lib/client/channel";
import { STATUS_LABEL } from "@/lib/metadata/transitions";
import { PageHeader } from "@/components/shell/page-header";
import { PostCard } from "./post-card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function Library() {
  const [channel] = useChannel();
  const sp = useSearchParams();
  const initialStatus = PostStatusSchema.safeParse(sp.get("status"));
  const [status, setStatus] = useState<PostStatus | "all">(initialStatus.success ? initialStatus.data : "all");
  const [type, setType] = useState<"all" | "single" | "carousel">("all");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const posts = usePosts({
    channel: channel ?? undefined,
    status: status === "all" ? undefined : status,
    type: type === "all" ? undefined : type,
    from: from || undefined,
    to: to || undefined,
  });

  const filtered = useMemo(() => {
    const list = posts.data?.posts ?? [];
    if (!q.trim()) return list;
    const needle = q.toLowerCase();
    return list.filter((p) => `${p.headline} ${p.topic} ${p.post_id}`.toLowerCase().includes(needle));
  }, [posts.data, q]);

  return (
    <>
      <PageHeader
        title={channel ? `${CHANNEL_META[channel].name} 라이브러리` : "라이브러리"}
        description={`${filtered.length}개`}
      />
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="헤드라인 · 주제 · ID 검색" className="h-8 w-64 pl-8 text-sm" />
        </div>
        <div className="flex flex-wrap gap-1">
          <Chip active={status === "all"} onClick={() => setStatus("all")}>전체</Chip>
          {POST_STATUSES.map((s) => (
            <Chip key={s} active={status === s} onClick={() => setStatus(s)}>{STATUS_LABEL[s]}</Chip>
          ))}
        </div>
        <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">모든 형식</SelectItem>
            <SelectItem value="single">단일</SelectItem>
            <SelectItem value="carousel">캐러셀</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36 text-xs" />
          <span>–</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36 text-xs" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {posts.isLoading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[4/5] animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">조건에 맞는 포스트가 없습니다.</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
            {filtered.map((p) => (
              <PostCard key={p.post_id} post={p} href={p.status === "draft" || p.status === "needs_repair" ? undefined : `/publish/${encodeURIComponent(p.post_id)}`} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("rounded-full px-2.5 py-1 text-xs transition-colors", active ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground")}
    >
      {children}
    </button>
  );
}
