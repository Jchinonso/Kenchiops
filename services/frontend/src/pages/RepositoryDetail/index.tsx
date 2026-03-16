/**
 * Repository Detail Page
 *
 * Shows filtered failures and analyses for a specific repository.
 * Accessed via /dashboard/cicd/pipelines/:repoFullName
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useFailures, useAnalyses } from "@/hooks/useDashboardData";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  ArrowLeft,
  ExternalLink,
  AlertTriangle,
  Search,
  GitBranch,
  Zap,
  TrendingUp,
} from "lucide-react";
import { PaginationControls } from "@/components/PaginationControls";
import { useSubscriptionUsage } from "@/hooks/useSubscription";
import { FeatureLocked } from "@/components/FeatureLocked";
import { PageLoader } from "@/components/PageLoader";
import { FailureItem } from "./FailureItem";
import { AnalysisItem } from "./AnalysisItem";
import { formatAvgConfidence } from "./helpers";
import { PAGE_SIZE } from "./constants";
import type { RepositoryDetailProps } from "./types";

// ==================== Main Component ====================

export const RepositoryDetail = ({ repoFullName }: RepositoryDetailProps) => {
  const { data: usageData, isLoading: isUsageLoading } = useSubscriptionUsage();
  const isAnyLimitReached = usageData
    ? Object.values(usageData.usage).some(
        (usage) => usage.limited && usage.limit !== null && usage.current >= usage.limit
      )
    : false;

  const [failuresOffset, setFailuresOffset] = useState(0);
  const [analysesOffset, setAnalysesOffset] = useState(0);
  const [failuresPageSize, setFailuresPageSize] = useState(PAGE_SIZE);
  const [analysesPageSize, setAnalysesPageSize] = useState(PAGE_SIZE);

  const handleFailuresPageSizeChange = (size: number) => {
    setFailuresPageSize(size);
    setFailuresOffset(0);
  };

  const handleAnalysesPageSizeChange = (size: number) => {
    setAnalysesPageSize(size);
    setAnalysesOffset(0);
  };

  const { data: failuresData, isLoading: failuresLoading } = useFailures({
    limit: failuresPageSize,
    offset: failuresOffset,
    repository: repoFullName,
  });
  const { data: analysesData, isLoading: analysesLoading } = useAnalyses({
    limit: analysesPageSize,
    offset: analysesOffset,
    repository: repoFullName,
  });

  const failureItems = failuresData?.items ?? [];
  const failuresTotal = failuresData?.total ?? 0;
  const failuresCurrentPage = Math.floor(failuresOffset / failuresPageSize) + 1;
  const failuresTotalPages = Math.ceil(failuresTotal / failuresPageSize);

  const analysisItems = analysesData?.items ?? [];
  const analysesTotal = analysesData?.total ?? 0;
  const analysesCurrentPage = Math.floor(analysesOffset / analysesPageSize) + 1;
  const analysesTotalPages = Math.ceil(analysesTotal / analysesPageSize);

  if (isUsageLoading) {
    return <PageLoader />;
  }

  if (isAnyLimitReached && usageData) {
    return (
      <FeatureLocked
        description="You have reached your plan's usage limits. Upgrade to continue viewing repository details."
        usage={usageData.usage}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          to="/dashboard/cicd/pipelines"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 mb-3 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Pipelines
        </Link>
        <div className="flex items-center gap-3">
          <GitBranch className="w-6 h-6 text-indigo-500" />
          <div>
            <h1 className="text-xl sm:text-2xl font-display font-bold text-zinc-900 dark:text-zinc-100">
              {repoFullName}
            </h1>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={`https://github.com/${repoFullName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-indigo-500 hover:text-indigo-600 transition-colors"
                >
                  View on GitHub
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </TooltipTrigger>
              <TooltipContent>View on GitHub</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Repository Stats */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Card className="py-4">
          <CardContent className="px-4 sm:px-6">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mb-1">Failures</p>
                {failuresLoading ? (
                  <Skeleton className="h-7 w-10 mt-1" />
                ) : (
                  <p className="text-xl sm:text-2xl font-display font-bold text-zinc-900 dark:text-zinc-100">
                    {failuresTotal}
                  </p>
                )}
              </div>
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-red-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="px-4 sm:px-6">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mb-1">Analyses</p>
                {analysesLoading ? (
                  <Skeleton className="h-7 w-10 mt-1" />
                ) : (
                  <p className="text-xl sm:text-2xl font-display font-bold text-zinc-900 dark:text-zinc-100">
                    {analysesTotal}
                  </p>
                )}
              </div>
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="px-4 sm:px-6">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mb-1">
                  Avg Confidence
                </p>
                {analysesLoading ? (
                  <Skeleton className="h-7 w-10 mt-1" />
                ) : (
                  <p className="text-xl sm:text-2xl font-display font-bold text-zinc-900 dark:text-zinc-100">
                    {formatAvgConfidence(analysisItems)}
                  </p>
                )}
              </div>
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-blue-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Failures */}
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <CardTitle>Failures</CardTitle>
            </div>
            <CardDescription>
              {failuresTotal > 0
                ? `${failuresTotal} failure${failuresTotal > 1 ? "s" : ""}`
                : "No failures recorded"}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            {failuresLoading ? (
              <div className="space-y-3 py-2">
                {Array.from({ length: 3 }, (_, idx) => (
                  <div key={`skel-f-${idx}`} className="space-y-1.5">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                ))}
              </div>
            ) : failureItems.length === 0 ? (
              <Empty className="py-8 border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <AlertTriangle className="w-5 h-5" />
                  </EmptyMedia>
                  <EmptyTitle>No failures</EmptyTitle>
                  <EmptyDescription>
                    No CI/CD failures recorded for this repository.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {failureItems.map((event) => (
                  <FailureItem key={event.id} event={event} />
                ))}
              </div>
            )}
          </CardContent>
          {failureItems.length > 0 && (
            <PaginationControls
              currentPage={failuresCurrentPage}
              totalPages={failuresTotalPages}
              hasPrev={failuresOffset > 0}
              hasNext={failuresOffset + failuresPageSize < failuresTotal}
              onPrev={() => setFailuresOffset((prev) => Math.max(0, prev - failuresPageSize))}
              onNext={() => setFailuresOffset((prev) => prev + failuresPageSize)}
              totalItems={failuresTotal}
              pageSize={failuresPageSize}
              onPageSizeChange={handleFailuresPageSizeChange}
            />
          )}
        </Card>

        {/* Analyses */}
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center gap-2">
              <Search className="w-5 h-5 text-indigo-500" />
              <CardTitle>Analyses</CardTitle>
            </div>
            <CardDescription>
              {analysesTotal > 0
                ? `${analysesTotal} analys${analysesTotal > 1 ? "es" : "is"}`
                : "No analyses recorded"}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            {analysesLoading ? (
              <div className="space-y-3 py-2">
                {Array.from({ length: 3 }, (_, idx) => (
                  <div key={`skel-a-${idx}`} className="space-y-1.5">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                ))}
              </div>
            ) : analysisItems.length === 0 ? (
              <Empty className="py-8 border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Search className="w-5 h-5" />
                  </EmptyMedia>
                  <EmptyTitle>No analyses</EmptyTitle>
                  <EmptyDescription>No analyses recorded for this repository.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {analysisItems.map((analysis) => (
                  <AnalysisItem key={analysis.id} analysis={analysis} />
                ))}
              </div>
            )}
          </CardContent>
          {analysisItems.length > 0 && (
            <PaginationControls
              currentPage={analysesCurrentPage}
              totalPages={analysesTotalPages}
              hasPrev={analysesOffset > 0}
              hasNext={analysesOffset + analysesPageSize < analysesTotal}
              onPrev={() => setAnalysesOffset((prev) => Math.max(0, prev - analysesPageSize))}
              onNext={() => setAnalysesOffset((prev) => prev + analysesPageSize)}
              totalItems={analysesTotal}
              pageSize={analysesPageSize}
              onPageSizeChange={handleAnalysesPageSizeChange}
            />
          )}
        </Card>
      </div>
    </div>
  );
};
