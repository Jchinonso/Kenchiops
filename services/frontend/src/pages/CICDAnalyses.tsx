/**
 * CI/CD Analyses Page
 *
 * Lists recent CI/CD analysis results with pagination.
 * Data comes from the dashboard API (analyses scoped to tenant).
 * Rows expand inline to show recommended actions and confidence signals.
 */

import { Fragment, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  Search,
  ChevronRight,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
} from "lucide-react";
import {
  useAnalyses,
  useAnalysisCountsByRepo,
  type AnalysisRecord,
} from "@/hooks/useDashboardData";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  getConfidenceLabel,
  getConfidenceStyle,
  truncateText,
  extractRepoFromKey,
} from "@/lib/formatters";
import { TimeDisplay } from "@/components/TimeDisplay";
import { TableSkeleton } from "@/components/TableSkeleton";
import { PaginationControls } from "@/components/PaginationControls";
import {
  FilterBar,
  parseConfidenceFilter,
  timeRangeToSince,
  loadSavedFilters,
  saveFilters,
  type FilterValues,
} from "@/components/FilterBar";
import { AnalysisDetailPanel } from "@/pages/AnalysisDetailPanel";
import { exportAnalysesToCSV } from "@/lib/csvExport";

// ==================== Helpers ====================

const PAGE_SIZE = 20;

interface SortConfig {
  readonly column: string;
  readonly direction: "asc" | "desc" | null;
}

const cycleSortDirection = (current: "asc" | "desc" | null): "asc" | "desc" | null =>
  current === null ? "asc" : current === "asc" ? "desc" : null;

interface SortableTableHeadProps {
  readonly label: string;
  readonly column: string;
  readonly currentSort: SortConfig;
  readonly onSort: (column: string) => void;
}

const SortableTableHead = ({ label, column, currentSort, onSort }: SortableTableHeadProps) => {
  const { column: sortColumn, direction: sortDirection } = currentSort;
  const isActive = sortColumn === column && sortDirection !== null;
  const Icon =
    isActive && sortDirection === "asc"
      ? ArrowUp
      : isActive && sortDirection === "desc"
        ? ArrowDown
        : ArrowUpDown;

  const ariaSortValue: "ascending" | "descending" | "none" =
    isActive && sortDirection === "asc"
      ? "ascending"
      : isActive && sortDirection === "desc"
        ? "descending"
        : "none";

  return (
    <TableHead
      scope="col"
      aria-sort={ariaSortValue}
      className="cursor-pointer select-none hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        <Icon className={cn("w-3.5 h-3.5", isActive ? "text-indigo-500" : "text-gray-400")} />
      </div>
    </TableHead>
  );
};

// ==================== Sub-components ====================

interface AnalysisRowProps {
  readonly analysis: AnalysisRecord;
  readonly isExpanded: boolean;
  readonly onClick: () => void;
}

const AnalysisRow = ({ analysis, isExpanded, onClick }: AnalysisRowProps) => {
  const repo = extractRepoFromKey(analysis.aggregationKey, analysis.fullAnalysis);
  const confidence = Math.round(analysis.diagnosisConfidence * 100);
  const commitSha = analysis.headSha ?? null;
  const shortSha = commitSha ? commitSha.slice(0, 7) : null;

  return (
    <TableRow
      onClick={onClick}
      onKeyDown={(keyEvent) => {
        const { key } = keyEvent;
        if (key === "Enter" || key === " ") {
          keyEvent.preventDefault();
          onClick();
        }
      }}
      tabIndex={0}
      aria-expanded={isExpanded}
      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset"
    >
      <TableCell className="w-8">
        <ChevronRight
          aria-hidden="true"
          className={cn("w-4 h-4 text-gray-400 transition-transform", isExpanded && "rotate-90")}
        />
      </TableCell>
      <TableCell className="text-gray-500 dark:text-gray-400 text-xs">
        <TimeDisplay dateTime={analysis.createdAt} />
      </TableCell>
      <TableCell className="text-gray-700 dark:text-gray-300 font-medium text-xs">{repo}</TableCell>
      <TableCell className="max-w-sm">
        <p className="text-sm text-gray-900 dark:text-gray-100 truncate">
          {truncateText(analysis.summary, 100)}
        </p>
        {analysis.identifiedCause && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
            Cause: {truncateText(analysis.identifiedCause, 60)}
          </p>
        )}
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={cn("text-xs", getConfidenceStyle(analysis.diagnosisConfidence))}
        >
          {getConfidenceLabel(analysis.diagnosisConfidence)} ({confidence}%)
        </Badge>
      </TableCell>
      <TableCell className="text-gray-500 dark:text-gray-400 font-mono text-xs">
        {shortSha && repo !== "--" ? (
          <a
            href={`https://github.com/${repo}/commit/${commitSha}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-indigo-500 underline decoration-dotted underline-offset-2 transition-colors"
            onClick={(linkEvent) => linkEvent.stopPropagation()}
          >
            {shortSha}
          </a>
        ) : shortSha ? (
          <span>{shortSha}</span>
        ) : (
          <span className="font-sans text-gray-400 dark:text-gray-500">--</span>
        )}
      </TableCell>
    </TableRow>
  );
};

// ==================== Expanded Row ====================

interface ExpandedAnalysisRowProps {
  readonly analysis: AnalysisRecord;
  readonly onViewDetails: () => void;
}

const ExpandedAnalysisRow = ({ analysis, onViewDetails }: ExpandedAnalysisRowProps) => {
  const hasActions = analysis.recommendedActions !== null && analysis.recommendedActions.length > 0;
  const hasCause = analysis.identifiedCause !== null && analysis.identifiedCause.length > 0;

  return (
    <TableRow className="hover:bg-gray-50 dark:hover:bg-gray-800">
      <TableCell colSpan={6} className="bg-gray-50 dark:bg-gray-800/50 border-b p-0 max-w-0">
        <div className="p-4 space-y-3">
          {hasCause && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Root Cause
              </h4>
              <p className="text-sm text-gray-900 dark:text-gray-100 break-words whitespace-pre-wrap">
                {analysis.identifiedCause}
              </p>
            </div>
          )}

          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Recommended Actions
            </h4>
            {hasActions ? (
              <ol className="list-decimal list-inside space-y-1">
                {(analysis.recommendedActions ?? []).map((action) => (
                  <li key={action} className="text-sm text-gray-900 dark:text-gray-100 break-words">
                    {action}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500">No recommended actions.</p>
            )}
          </div>

          <div>
            <button
              type="button"
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium"
              onClick={(event) => {
                event.stopPropagation();
                onViewDetails();
              }}
            >
              View Full Details →
            </button>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
};

// ==================== Main Component ====================

interface CICDAnalysesProps {
  readonly refreshKey?: number;
}

export const CICDAnalyses = ({ refreshKey = 0 }: CICDAnalysesProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortConfig>({ column: "", direction: null });
  const [filters, setFilters] = useState<FilterValues>(() => {
    const saved = loadSavedFilters("analyses");
    return {
      repository: searchParams.get("repository") ?? saved?.repository ?? "",
      severity: "",
      minConfidence: searchParams.get("confidence") ?? saved?.minConfidence ?? "",
      timeRange: searchParams.get("timeRange") ?? saved?.timeRange ?? "",
    };
  });

  const { data: analysisCountsByRepo } = useAnalysisCountsByRepo(refreshKey);
  const hasRepoTabs = (analysisCountsByRepo?.length ?? 0) > 1;
  const [activeRepoTab, setActiveRepoTab] = useState<string>("all");

  const handleRepoTabChange = useCallback(
    (repo: string) => {
      setActiveRepoTab(repo);
      setOffset(0);
      setExpandedId(null);
      const nextRepo = repo === "all" ? "" : repo;
      setFilters((prev) => ({ ...prev, repository: nextRepo }));
      const params = new URLSearchParams();
      if (nextRepo) {
        params.set("repository", nextRepo);
      }
      if (filters.minConfidence) {
        params.set("confidence", filters.minConfidence);
      }
      if (filters.timeRange) {
        params.set("timeRange", filters.timeRange);
      }
      setSearchParams(params, { replace: true });
      saveFilters("analyses", { ...filters, repository: nextRepo });
    },
    [filters, setSearchParams]
  );

  const handleFilterChange = useCallback(
    (next: FilterValues) => {
      setFilters(next);
      setOffset(0);
      setExpandedId(null);
      saveFilters("analyses", next);
      const params = new URLSearchParams();
      if (next.repository) {
        params.set("repository", next.repository);
      }
      if (next.minConfidence) {
        params.set("confidence", next.minConfidence);
      }
      if (next.timeRange) {
        params.set("timeRange", next.timeRange);
      }
      setSearchParams(params, { replace: true });
    },
    [setSearchParams]
  );

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setOffset(0);
    setExpandedId(null);
  };

  const handleSort = (column: string) => {
    setSort((prev) => {
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

  const { data, isLoading, error, refetch } = useAnalyses(
    pageSize,
    offset,
    refreshKey,
    filters.repository || undefined,
    confidenceRange.min !== null ? String(confidenceRange.min) : undefined,
    confidenceRange.max !== null ? String(confidenceRange.max) : undefined,
    since
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const sortedItems = useMemo(() => {
    const { column, direction } = sort;
    if (!direction) {
      return items;
    }

    const multiplier = direction === "asc" ? 1 : -1;
    return [...items].sort((left, right) => {
      if (column === "createdAt") {
        return (
          multiplier * (new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
        );
      }
      if (column === "confidence") {
        return multiplier * (left.diagnosisConfidence - right.diagnosisConfidence);
      }
      return 0;
    });
  }, [items, sort]);

  const hasItems = Boolean(items.length);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
          CI/CD Analyses
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
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
                : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
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
                  : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
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
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton />
          ) : error ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              <button
                type="button"
                onClick={refetch}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          ) : !hasItems ? (
            <Empty className="py-12 border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Search className="w-6 h-6" />
                </EmptyMedia>
                <EmptyTitle>
                  {filters.repository || filters.minConfidence || filters.timeRange
                    ? "No matching analyses"
                    : "No analyses yet"}
                </EmptyTitle>
                <EmptyDescription>
                  {filters.repository || filters.minConfidence || filters.timeRange
                    ? "Try adjusting your filters to find what you're looking for."
                    : "When Kenchi detects CI/CD failures, it automatically runs root cause analysis. Results will appear here."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableCaption className="sr-only">
                    CI/CD analysis results table showing repository, confidence, and commit
                  </TableCaption>
                  <TableHeader className="bg-gray-50/80 dark:bg-gray-800/50">
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
          )}
        </CardContent>
      </Card>

      <AnalysisDetailPanel
        analysisId={selectedAnalysisId}
        open={selectedAnalysisId !== null}
        onClose={() => setSelectedAnalysisId(null)}
      />
    </div>
  );
};
