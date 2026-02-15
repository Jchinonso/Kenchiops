/**
 * Repository Detail Page
 *
 * Shows filtered failures and analyses for a specific repository.
 * Accessed via /dashboard/cicd/pipelines/:repoFullName
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useFailures,
  useAnalyses,
  type EventRecord,
  type AnalysisRecord,
} from "@/hooks/useDashboardData";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import {
  formatTimestamp,
  truncateText,
  getConfidenceLabel,
  getConfidenceStyle,
  getSeverityStyle,
  getPayloadString,
} from "@/lib/formatters";
import { PaginationControls } from "@/components/PaginationControls";
import { ArrowLeft, ExternalLink, AlertTriangle, Search, GitBranch } from "lucide-react";

// ==================== Constants ====================

const PAGE_SIZE = 10;

// ==================== Sub-components ====================

interface FailureItemProps {
  readonly event: EventRecord;
}

const FailureItem = ({ event }: FailureItemProps) => {
  const checkName = getPayloadString(event.payload, "checkName");
  const conclusion = getPayloadString(event.payload, "conclusion");

  return (
    <div className="py-3 first:pt-2 last:pb-1 hover:bg-gray-50 dark:hover:bg-gray-800 -mx-6 px-6 transition-colors">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {formatTimestamp(event.timestamp)}
        </span>
        <Badge
          variant="outline"
          className={cn("text-[10px] px-1.5 py-0", getSeverityStyle(event.severity))}
        >
          {event.severity ?? "unknown"}
        </Badge>
      </div>
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{checkName}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{conclusion}</p>
    </div>
  );
};

interface AnalysisItemProps {
  readonly analysis: AnalysisRecord;
}

const AnalysisItem = ({ analysis }: AnalysisItemProps) => (
  <div className="py-3 first:pt-2 last:pb-1 hover:bg-gray-50 dark:hover:bg-gray-800 -mx-6 px-6 transition-colors">
    <div className="flex items-center justify-between gap-2 mb-1">
      <span className="text-xs text-gray-400 dark:text-gray-500">
        {formatTimestamp(analysis.createdAt)}
      </span>
      <Badge
        variant="outline"
        className={cn("text-[10px] px-1.5 py-0", getConfidenceStyle(analysis.diagnosisConfidence))}
      >
        {getConfidenceLabel(analysis.diagnosisConfidence)}
      </Badge>
    </div>
    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
      {truncateText(analysis.summary, 80)}
    </p>
    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
      {analysis.identifiedCause ? truncateText(analysis.identifiedCause, 60) : "--"}
    </p>
  </div>
);

// ==================== Main Component ====================

interface RepositoryDetailProps {
  readonly repoFullName: string;
  readonly refreshKey?: number;
}

export const RepositoryDetail = ({ repoFullName, refreshKey = 0 }: RepositoryDetailProps) => {
  const [failuresOffset, setFailuresOffset] = useState(0);
  const [analysesOffset, setAnalysesOffset] = useState(0);

  const { data: failuresData, isLoading: failuresLoading } = useFailures(
    PAGE_SIZE,
    failuresOffset,
    refreshKey,
    repoFullName
  );
  const { data: analysesData, isLoading: analysesLoading } = useAnalyses(
    PAGE_SIZE,
    analysesOffset,
    refreshKey,
    repoFullName
  );

  const failureItems = failuresData?.items ?? [];
  const failuresTotal = failuresData?.total ?? 0;
  const failuresCurrentPage = Math.floor(failuresOffset / PAGE_SIZE) + 1;
  const failuresTotalPages = Math.ceil(failuresTotal / PAGE_SIZE);

  const analysisItems = analysesData?.items ?? [];
  const analysesTotal = analysesData?.total ?? 0;
  const analysesCurrentPage = Math.floor(analysesOffset / PAGE_SIZE) + 1;
  const analysesTotalPages = Math.ceil(analysesTotal / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          to="/dashboard/cicd/pipelines"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-3 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Pipelines
        </Link>
        <div className="flex items-center gap-3">
          <GitBranch className="w-6 h-6 text-indigo-500" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
              {repoFullName}
            </h1>
            <a
              href={`https://github.com/${repoFullName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-indigo-500 hover:text-indigo-600 transition-colors"
            >
              View on GitHub
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
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
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {failureItems.map((event) => (
                  <FailureItem key={event.id} event={event} />
                ))}
              </div>
            )}
          </CardContent>
          {failuresTotalPages > 1 && (
            <PaginationControls
              currentPage={failuresCurrentPage}
              totalPages={failuresTotalPages}
              hasPrev={failuresOffset > 0}
              hasNext={failuresOffset + PAGE_SIZE < failuresTotal}
              onPrev={() => setFailuresOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
              onNext={() => setFailuresOffset((prev) => prev + PAGE_SIZE)}
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
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {analysisItems.map((analysis) => (
                  <AnalysisItem key={analysis.id} analysis={analysis} />
                ))}
              </div>
            )}
          </CardContent>
          {analysesTotalPages > 1 && (
            <PaginationControls
              currentPage={analysesCurrentPage}
              totalPages={analysesTotalPages}
              hasPrev={analysesOffset > 0}
              hasNext={analysesOffset + PAGE_SIZE < analysesTotal}
              onPrev={() => setAnalysesOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
              onNext={() => setAnalysesOffset((prev) => prev + PAGE_SIZE)}
            />
          )}
        </Card>
      </div>
    </div>
  );
};
