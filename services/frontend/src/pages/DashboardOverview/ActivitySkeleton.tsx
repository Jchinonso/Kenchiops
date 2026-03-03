import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const ActivitySkeleton = () => (
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
    {Array.from({ length: 3 }, (_, cardIndex) => (
      <Card key={`skel-card-${cardIndex}`}>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-32" />
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          {Array.from({ length: 3 }, (_unused, rowIndex) => (
            <div key={`skel-row-${cardIndex}-${rowIndex}`} className="space-y-1.5 py-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    ))}
  </div>
);
