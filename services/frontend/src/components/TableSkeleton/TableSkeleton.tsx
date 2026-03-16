import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import type { TableSkeletonProps } from "./types";

export const TableSkeleton = ({ rows = 5, columns = 5 }: TableSkeletonProps) => {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="p-3 space-y-3">
        {Array.from({ length: Math.min(rows, 4) }, (_, idx) => (
          <div
            key={`card-${idx}`}
            className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-3 w-1/3" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {/* Header skeleton */}
      <div className="flex items-center gap-4 pb-2 border-b border-zinc-100 dark:border-zinc-800">
        {Array.from({ length: columns }, (_, idx) => (
          <Skeleton key={`hdr-${idx}`} className="h-4 flex-1 max-w-[120px]" />
        ))}
      </div>
      {/* Row skeletons */}
      {Array.from({ length: rows }, (_, idx) => (
        <div key={`row-${idx}`} className="flex items-center gap-4">
          {Array.from({ length: columns }, (_unused, col) => (
            <Skeleton
              key={`cell-${idx}-${col}`}
              className={`h-4 flex-1 ${col === 0 ? "max-w-[80px]" : "max-w-[160px]"}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
};
