import { Card, CardContent } from "@/components/ui/card";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActivityFeedProps } from "./types";
import { ActivitySkeleton } from "./ActivitySkeleton";
import { ActivityEmpty } from "./ActivityEmpty";
import { RecentFailures } from "./RecentFailures";
import { RecentAnalyses } from "./RecentAnalyses";
import { RecentIncidents } from "./RecentIncidents";

export const ActivityFeed = ({
  failureItems,
  analysisItems,
  incidentItems,
  activityLoading,
  failuresError,
  analysesError,
  isNewUser,
  refetchFailures,
  refetchAnalyses,
  activityGridCols,
}: ActivityFeedProps) => {
  const hasActivity =
    failureItems.length > 0 || analysisItems.length > 0 || incidentItems.length > 0;

  if ((failuresError || analysesError) && !activityLoading && !isNewUser) {
    return (
      <Card className="mb-6 sm:mb-8">
        <CardContent className="py-8 text-center space-y-3">
          <p className="text-sm text-red-600 dark:text-red-400">{failuresError ?? analysesError}</p>
          <button
            type="button"
            onClick={() => {
              if (failuresError) {
                refetchFailures();
              }
              if (analysesError) {
                refetchAnalyses();
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  if (activityLoading) {
    return <ActivitySkeleton />;
  }

  if (!hasActivity) {
    return <ActivityEmpty />;
  }

  return (
    <div
      className={cn("grid gap-4 sm:gap-6 mb-6 sm:mb-8 opacity-0 animate-fade-in", activityGridCols)}
      style={{ animationDelay: "400ms" }}
    >
      {failureItems.length > 0 && <RecentFailures items={failureItems} />}
      {analysisItems.length > 0 && <RecentAnalyses items={analysisItems} />}
      {incidentItems.length > 0 && <RecentIncidents items={incidentItems} />}
    </div>
  );
};
