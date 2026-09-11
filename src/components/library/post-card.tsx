"use client";

import Link from "next/link";
import { AlertTriangle, Images, Image as ImageIcon } from "lucide-react";
import type { IndexEntry } from "@/types";
import { cn } from "@/lib/utils";
import { driveFileUrl } from "@/lib/client/api";
import { CHANNEL_META } from "@/lib/client/channel";
import { StatusBadge } from "./status-badge";

export function PostCard({ post, href }: { post: IndexEntry; href?: string }) {
  const target = href ?? `/editor/${encodeURIComponent(post.post_id)}`;
  const warn = post.warnings.filter((w) => w !== "missing_render" && w !== "render_count_mismatch");
  return (
    <Link
      href={target}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted">
        {post.cover_thumb_file_id ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={driveFileUrl(post.cover_thumb_file_id)}
            alt=""
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImageIcon className="size-6" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-10">
          <div className="line-clamp-3 whitespace-pre-line text-[15px] font-bold leading-snug text-white drop-shadow">
            {post.headline || post.post_id}
          </div>
        </div>
        <div className="absolute left-2 top-2 flex items-center gap-1.5">
          <span className="rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white" style={{ boxShadow: `inset 0 -2px 0 ${CHANNEL_META[post.channel].color}` }}>
            {post.channel}
          </span>
          {post.content_type === "carousel" && (
            <span className="flex items-center gap-1 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
              <Images className="size-3" /> {post.slide_count}
            </span>
          )}
        </div>
        {warn.length > 0 && (
          <span className="absolute right-2 top-2 rounded-md bg-rose-600 p-1 text-white" title={warn.join(", ")}>
            <AlertTriangle className="size-3" />
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <StatusBadge status={post.status} />
        <span className={cn("truncate text-[11px] text-muted-foreground")}>{post.post_id.slice(0, 10)}</span>
      </div>
    </Link>
  );
}
