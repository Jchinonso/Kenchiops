import { Skeleton } from "@/components/ui/skeleton";

export const GridSkeleton = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {Array.from({ length: 6 }, (_, idx) => (
      <Skeleton key={idx} className="h-32 w-full rounded-lg" />
    ))}
  </div>
);
