import { Skeleton } from "@/components/ui/skeleton";

export const LoadingSkeleton = () => (
  <div className="space-y-3 p-4">
    {Array.from({ length: 4 }, (_, index) => (
      <div key={index} className="flex items-center gap-3">
        <Skeleton className="w-8 h-8 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-5 w-16" />
      </div>
    ))}
  </div>
);
