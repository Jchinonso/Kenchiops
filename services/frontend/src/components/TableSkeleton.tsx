import { Skeleton } from "@/components/ui/skeleton";

interface TableSkeletonProps {
  readonly rows?: number;
}

export const TableSkeleton = ({ rows = 5 }: TableSkeletonProps) => (
  <div className="space-y-3 p-4">
    {Array.from({ length: rows }, (_, idx) => (
      <Skeleton key={idx} className="h-12 w-full" />
    ))}
  </div>
);
