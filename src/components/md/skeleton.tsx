import { cn } from "@/lib/utils";

/** Montage Skeleton — fill-normal 면이 천천히 깜빡인다. 실제 레이아웃 자리를 그대로 차지해 점프가 없다. */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-fill", className)} style={style} />;
}

/** 홈 카드 그리드 자리 (4:5 커버 + 제목 2줄 + 메타) */
export function CardGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }} aria-busy>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2.5">
          <Skeleton className="aspect-[4/5] rounded-xl" />
          <Skeleton className="h-4 w-[85%]" />
          <Skeleton className="h-4 w-[55%]" />
          <Skeleton className="h-3 w-[40%]" />
        </div>
      ))}
    </div>
  );
}

/** 프로필 그리드 자리 (아바타 + 핸들 + 3열 정사각) */
export function ProfileGridSkeleton() {
  return (
    <div className="max-w-[900px]" aria-busy>
      <div className="flex items-center gap-4 px-1 pb-6 pt-5">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-52" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-none" />
        ))}
      </div>
    </div>
  );
}

/** 빌더 자리 — 헤더 · 좌 패널 · 캔버스 · 우 패널 · 슬라이드 스트립 */
export function BuilderSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-alt" aria-busy>
      <div className="flex h-14 shrink-0 items-center gap-3 bg-surface px-4" style={{ boxShadow: "inset 0 -1px 0 var(--semantic-line-solid-neutral)" }}>
        <Skeleton className="h-5 w-12" />
        <Skeleton className="h-5 w-[300px]" />
        <Skeleton className="h-6 w-16 rounded-md" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="size-8" />
          <Skeleton className="size-8" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-10 w-[86px] rounded-[10px]" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-[260px] shrink-0 flex-col gap-3 bg-surface p-4" style={{ boxShadow: "inset -1px 0 0 var(--semantic-line-solid-neutral)" }}>
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-8 w-full" />
          <div className="grid grid-cols-2 gap-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Skeleton className="aspect-[4/5]" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        </aside>
        <section className="flex min-w-0 flex-1 flex-col items-center gap-3.5 px-6 pb-4 pt-4">
          <div className="h-10 shrink-0" />
          <div className="grid min-h-0 w-full flex-1 place-items-center">
            <Skeleton className="h-[min(100%,540px)] w-auto rounded-[4px]" style={{ aspectRatio: "4 / 5", maxWidth: "100%" }} />
          </div>
          <div className="flex h-8 shrink-0 items-center gap-2.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-24" />
          </div>
        </section>
        <aside className="flex w-[320px] shrink-0 flex-col gap-[18px] bg-surface px-4 pt-4" style={{ boxShadow: "inset 1px 0 0 var(--semantic-line-solid-neutral)" }}>
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-16 w-full rounded-xl" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="flex justify-between"><Skeleton className="h-3 w-12" /><Skeleton className="h-3 w-10" /></div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
          <Skeleton className="h-8 w-full" />
        </aside>
      </div>
      <div className="flex shrink-0 items-center justify-center gap-2.5 bg-surface px-4 py-2.5" style={{ boxShadow: "inset 0 1px 0 var(--semantic-line-solid-neutral)" }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex w-[68px] flex-col gap-[5px]">
            <Skeleton className="h-[85px] w-[68px]" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
        <Skeleton className="h-[85px] w-[68px]" />
      </div>
    </div>
  );
}

/** 설정·게시 기록 같은 중앙 컬럼 카드 페이지 자리 */
export function SectionsSkeleton({ sections = 2, maxWidth = 720 }: { sections?: number; maxWidth?: number }) {
  return (
    <div className="mx-auto box-border flex w-full flex-1 flex-col gap-7 overflow-auto px-5 pb-20 pt-8" style={{ maxWidth }} aria-busy>
      <div className="flex items-center gap-2.5">
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="h-7 w-40" />
      </div>
      {Array.from({ length: sections }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl bg-surface">
          <div className="flex flex-col gap-2 px-5 pb-3 pt-[18px]">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-3 w-64" />
          </div>
          {Array.from({ length: 3 }).map((_, j) => (
            <div key={j} className="flex items-center gap-3.5 px-5 py-3.5" style={{ boxShadow: "inset 0 1px 0 var(--semantic-line-solid-alternative)" }}>
              <Skeleton className="size-10 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-60" />
              </div>
              <Skeleton className="h-6 w-14" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
