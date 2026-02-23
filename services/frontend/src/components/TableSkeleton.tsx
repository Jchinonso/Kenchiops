import { Skeleton } from "@/components/ui/skeleton";

interface TableSkeletonProps {
  readonly rows?: number;
  readonly columns?: number;
}

export const TableSkeleton = ({ rows = 5, columns = 5 }: TableSkeletonProps) => (
  <div className="p-4 space-y-3">
    {/* Header skeleton */}
    <div className="flex items-center gap-4 pb-2 border-b border-gray-100 dark:border-gray-800">
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
