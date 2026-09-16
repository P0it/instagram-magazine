import { CardGridSkeleton, Skeleton } from "@/components/md/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto box-border w-full max-w-[1560px] flex-1 overflow-auto px-10 pb-16 pt-7">
      <div className="mb-5 flex flex-col gap-2.5">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-10 w-[340px] max-w-full rounded-[10px]" />
      </div>
      <CardGridSkeleton />
    </div>
  );
}
