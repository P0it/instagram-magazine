"use client";

import type { AccountKey } from "@/types";
import { usePosts } from "@/lib/client/queries";
import { driveFileUrl } from "@/lib/client/api";
import { cn } from "@/lib/utils";

/** 채널의 published + approved(+예정) 를 IG 프로필 그리드 모양으로. highlight 는 현재 포스트. */
export function GridPreview({ channel, highlight }: { channel: AccountKey; highlight?: string }) {
  const posts = usePosts({ channel });
  const list = (posts.data?.posts ?? [])
    .filter((p) => p.status === "published" || p.status === "approved" || p.status === "scheduled")
    .sort((a, b) => {
      const ka = a.published_at ?? a.scheduled_at ?? "9999";
      const kb = b.published_at ?? b.scheduled_at ?? "9999";
      return kb.localeCompare(ka);
    })
    .slice(0, 12);

  return (
    <div className="grid grid-cols-3 gap-0.5 rounded-lg overflow-hidden bg-border">
      {list.map((p) => (
        <div key={p.post_id} className={cn("relative aspect-[4/5] bg-muted", highlight === p.post_id && "ring-2 ring-inset ring-sky-500 z-10")}>
          {p.cover_thumb_file_id ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={driveFileUrl(p.cover_thumb_file_id)} alt="" className={cn("size-full object-cover", p.status !== "published" && "opacity-70")} />
          ) : (
            <div className="flex size-full items-center justify-center p-2 text-center text-[10px] text-muted-foreground">{p.headline.split("\n")[0]}</div>
          )}
          {p.status !== "published" && <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[9px] text-white">{p.status === "scheduled" ? "예약" : "승인"}</span>}
        </div>
      ))}
      {list.length === 0 && <div className="col-span-3 p-6 text-center text-xs text-muted-foreground">게시/승인된 포스트가 없습니다.</div>}
    </div>
  );
}
