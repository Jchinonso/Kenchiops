/**
 * CI/CD Analyses Page
 *
 * Lists recent CI/CD analysis results with pagination.
 * Data comes from the dashboard API (analyses scoped to tenant).
 * Rows expand inline to show recommended actions and confidence signals.
 */

import { Fragment, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCaption,
} from "@/components/ui/table";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Search, Download, RefreshCw } from "lucide-react";
import { useAnalyses, useAnalysisCountsByRepo } from "@/hooks/useDashboardData";
import { useSubscriptionUsage } from "@/hooks/useSubscription";
import { FeatureLocked } from "@/components/FeatureLocked";
import { PageLoader } from "@/components/PageLoader";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn, buildSearchParams } from "@/lib/utils";
import { TableSkeleton } from "@/components/TableSkeleton";
import { PaginationControls } from "@/components/PaginationControls";
import { FilterBar } from "@/components/FilterBar";
import {
  parseConfidenceFilter,
  timeRangeToSince,
  loadSavedFilters,
  saveFilters,
  type FilterValues,
} from "@/components/FilterBarUtils";
import { AnalysisDetailPanel } from "@/pages/AnalysisDetailPanel";
import { exportAnalysesToCSV } from "@/lib/csvExport";
import { SortableTableHead } from "@/components/SortableTableHead";
import { cycleSortDirection, type SortConfig } from "@/components/SortableTableHeadUtils";
import { AnalysisRow } from "./AnalysisRow";
import { ExpandedAnalysisRow } from "./ExpandedAnalysisRow";
import { PAGE_SIZE } from "./constants";
import type { CICDAnalysesProps } from "./types";

// ==================== Main Component ====================

export const CICDAnalyses = (_props: CICDAnalysesProps = {}) => {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? undefined;
  const { data: usageData, isLoading: isUsageLoading } = useSubscriptionUsage();
  const isAnyLimitReached = usageData
    ? Object.values(usageData.usage).some(
        (usage) => usage.limited && usage.limit !== null && usage.current >= usage.limit
      )
    : false;
  const [searchParams, setSearchParams] = useSearchParams();
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortConfig>({ column: "", direction: null });
  const [filters, setFilters] = useState<FilterValues>(() => {
    const saved = loadSavedFilters("analyses", tenantId);
    return {
      repository: searchParams.get("repository") ?? saved?.repository ?? "",
      severity: "",
      minConfidence: searchParams.get("confidence") ?? saved?.minConfidence ?? "",
      timeRange: searchParams.get("timeRange") ?? saved?.timeRange ?? "",
    };
  });

  const { data: analysisCountsByRepo } = useAnalysisCountsByRepo();
  const hasRepoTabs = (analysisCountsByRepo?.length ?? 0) > 1;
  const [activeRepoTab, setActiveRepoTab] = useState<string>("all");

  const handleRepoTabChange = (repo: string) => {
    setActiveRepoTab(repo);
    setOffset(0);
    setExpandedId(null);
    const nextRepo = repo === "all" ? "" : repo;
    setFilters((prev) => ({ ...prev, repository: nextRepo }));
    setSearchParams(
      buildSearchParams({
        repository: nextRepo,
        confidence: filters.minConfidence,
        timeRange: filters.timeRange,
      }),
      { replace: true }
    );
    saveFilters("analyses", { ...filters, repository: nextRepo }, tenantId);
  };

  const handleFilterChange = useCallback(
    (next: FilterValues) => {
      setFilters(next);
      setOffset(0);
      setExpandedId(null);
      saveFilters("analyses", next, tenantId);
      setSearchParams(
        buildSearchParams({
          repository: next.repository,
          confidence: next.minConfidence,
          timeRange: next.timeRange,
        }),
        { replace: true }
      );
    },
    [setSearchParams, tenantId]
  );

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setOffset(0);
    setExpandedId(null);
  };

  const handleSort = (column: string) => {
    setSort((prev: SortConfig) => {
      const { column: prevColumn, direction: prevDirection } = prev;
      return prevColumn === column
        ? { column, direction: cycleSortDirection(prevDirection) }
        : { column, direction: "asc" as const };
    });
  };

  const confidenceRange = useMemo(
    () => parseConfidenceFilter(filters.minConfidence),
    [filters.minConfidence]
  );

  const since = useMemo(() => timeRangeToSince(filters.timeRange), [filters.timeRange]);

  const { data, isLoading, error, refetch } = useAnalyses({
    limit: pageSize,
    offset,
    repository: filters.repository || undefined,
    minConfidence: confidenceRange.min !== null ? String(confidenceRange.min) : undefined,
    maxConfidence: confidenceRange.max !== null ? String(confidenceRange.max) : undefined,
    since,
  });

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const total = data?.total ?? 0;

  const sortedItems = useMemo(() => {
    const { column, direction } = sort;
    if (!direction) {
      return items;
    }

    const multiplier = direction === "asc" ? 1 : -1;
    return [...items].sort((left, right) => {
      switch (column) {
        case "createdAt":
          return (
            multiplier * (new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
          );
        case "confidence":
          return multiplier * (left.diagnosisConfidence - right.diagnosisConfidence);
        default:
          return 0;
      }
    });
  }, [items, sort]);

  const hasItems = Boolean(items.length);
  const hasActiveFilters = Boolean(
    filters.repository || filters.minConfidence || filters.timeRange
  );
  const currentPage = Math.floor(offset / pageSize) + 1;
  const totalPages = Math.ceil(total / pageSize);
  const hasPrev = offset > 0;
  const hasNext = offset + pageSize < total;

  const goNext = () => {
    setOffset((prev) => prev + pageSize);
    setExpandedId(null);
  };
  const goPrev = () => {
    setOffset((prev) => Math.max(0, prev - pageSize));
    setExpandedId(null);
  };

  const renderCardContent = (): React.ReactNode => {
    if (isLoading) {
      return <TableSkeleton />;
    }

    if (error) {
      return (
        <div className="p-8 text-center space-y-3">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button
            type="button"
            onClick={refetch}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      );
    }

    if (!hasItems) {
      return (
        <Empty className="py-12 border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search className="w-6 h-6" />
            </EmptyMedia>
            <EmptyTitle>{hasActiveFilters ? "No matching analyses" : "No analyses yet"}</EmptyTitle>
            <EmptyDescription>
              {hasActiveFilters
                ? "Try adjusting your filters to find what you're looking for."
                : "When Kenchi detects CI/CD failures, it automatically runs root cause analysis. Results will appear here."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    return (
      <>
        <div className="overflow-x-auto">
          <Table>
            <TableCaption className="sr-only">
              CI/CD analysis results table showing repository, confidence, and commit
            </TableCaption>
            <TableHeader className="bg-zinc-50/80 dark:bg-zinc-800/50">
              <TableRow>
                <TableHead scope="col" className="w-8" />
                <SortableTableHead
                  label="Time"
                  column="createdAt"
                  currentSort={sort}
                  onSort={handleSort}
                />
                <TableHead scope="col">Repository</TableHead>
                <TableHead scope="col">Summary</TableHead>
                <SortableTableHead
                  label="Confidence"
                  column="confidence"
                  currentSort={sort}
                  onSort={handleSort}
                />
                <TableHead scope="col">Commit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedItems.map((analysis) => (
                <Fragment key={analysis.id}>
                  <AnalysisRow
                    analysis={analysis}
                    isExpanded={expandedId === analysis.id}
                    onClick={() =>
                      setExpandedId((prev) => (prev === analysis.id ? null : analysis.id))
                    }
                  />
                  {expandedId === analysis.id && (
                    <ExpandedAnalysisRow
                      analysis={analysis}
                      onViewDetails={() => setSelectedAnalysisId(analysis.id)}
                    />
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>

        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          hasPrev={hasPrev}
          hasNext={hasNext}
          onPrev={goPrev}
          onNext={goNext}
          totalItems={total}
          pageSize={pageSize}
          onPageSizeChange={handlePageSizeChange}
        />
      </>
    );
  };

  if (isUsageLoading) {
    return <PageLoader />;
  }

  if (isAnyLimitReached && usageData) {
    return (
      <FeatureLocked
        description="You have reached your plan's usage limits. Upgrade to continue using CI/CD analyses."
        usage={usageData.usage}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-display font-bold text-zinc-900 dark:text-zinc-100">
          CI/CD Analyses
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          AI-powered root cause analysis of your CI/CD failures.
        </p>
      </div>

      {hasRepoTabs && analysisCountsByRepo && (
        <div
          className="flex flex-wrap items-center gap-2"
          role="tablist"
          aria-label="Filter by repository"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeRepoTab === "all"}
            onClick={() => handleRepoTabChange("all")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-full border transition-colors",
              activeRepoTab === "all"
                ? "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300"
                : "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700"
            )}
          >
            All ({analysisCountsByRepo.reduce((sum, entry) => sum + entry.analysisCount, 0)})
          </button>
          {analysisCountsByRepo.map((entry) => (
            <button
              key={entry.repository}
              type="button"
              role="tab"
              aria-selected={activeRepoTab === entry.repository}
              onClick={() => handleRepoTabChange(entry.repository)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-full border transition-colors",
                activeRepoTab === entry.repository
                  ? "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300"
                  : "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700"
              )}
            >
              {entry.repository} ({entry.analysisCount})
            </button>
          ))}
        </div>
      )}

      <FilterBar
        variant="analyses"
        filters={filters}
        onFilterChange={handleFilterChange}
        hideRepository={hasRepoTabs}
      />

      <div aria-live="polite" className="sr-only">
        {isLoading
          ? "Loading results..."
          : error
            ? "Error loading results"
            : `Showing ${items.length} of ${total} results`}
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search className="w-5 h-5 text-indigo-500" />
              <CardTitle>Analysis Results</CardTitle>
            </div>
            {hasItems && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => exportAnalysesToCSV(items)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export Page
                  </button>
                </TooltipTrigger>
                <TooltipContent>Download as CSV</TooltipContent>
              </Tooltip>
            )}
          </div>
          <CardDescription>
            {total > 0
              ? `${total} total analys${total > 1 ? "es" : "is"}`
              : "No analyses recorded yet"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">{renderCardContent()}</CardContent>
      </Card>

      <AnalysisDetailPanel
        analysisId={selectedAnalysisId}
        open={selectedAnalysisId !== null}
        onClose={() => setSelectedAnalysisId(null)}
      />
    </div>
  );
};
