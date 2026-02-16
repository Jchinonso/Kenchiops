/**
 * CI/CD Analyses Page
 *
 * Lists recent CI/CD analysis results with pagination.
 * Data comes from the dashboard API (analyses scoped to tenant).
 * Rows expand inline to show recommended actions and confidence signals.
 */

import { Fragment, useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
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
  AlertTriangle,
  ChevronRight,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
} from "lucide-react";
import { useAnalyses, type AnalysisRecord } from "@/hooks/useDashboardData";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  getConfidenceLabel,
  getConfidenceStyle,
  formatTimestamp,
  formatRelativeTime,
  truncateText,
  extractRepoFromKey,
} from "@/lib/formatters";
import { TableSkeleton } from "@/components/TableSkeleton";
import { PaginationControls } from "@/components/PaginationControls";
import { FilterBar, parseConfidenceFilter, type FilterValues } from "@/components/FilterBar";
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

  return (
    <TableHead
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

  return (
    <TableRow
      onClick={onClick}
      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
    >
      <TableCell className="w-8">
        <ChevronRight
          className={cn("w-4 h-4 text-gray-400 transition-transform", isExpanded && "rotate-90")}
        />
      </TableCell>
      <TableCell className="text-gray-500 dark:text-gray-400 text-xs">
        <span title={formatTimestamp(analysis.createdAt)}>
          {formatRelativeTime(analysis.createdAt)}
        </span>
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
      <TableCell>
        {analysis.eventId ? (
          <Link
            to="/dashboard/cicd/failures"
            className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
            onClick={(event) => event.stopPropagation()}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span className="text-xs underline">Linked</span>
          </Link>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500">No event</span>
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
      <TableCell colSpan={6} className="bg-gray-50 dark:bg-gray-800/50 border-b p-0">
        <div className="p-4 space-y-3">
          {hasCause && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                Root Cause
              </h4>
              <p className="text-sm text-gray-900 dark:text-gray-100">{analysis.identifiedCause}</p>
            </div>
          )}

          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Recommended Actions
            </h4>
            {hasActions ? (
              <ol className="list-decimal list-inside space-y-1">
                {(analysis.recommendedActions ?? []).map((action, index) => (
                  <li key={index} className="text-sm text-gray-900 dark:text-gray-100">
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
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortConfig>({ column: "", direction: null });
  const [filters, setFilters] = useState<FilterValues>({
    repository: "",
    severity: "",
    minConfidence: "",
  });

  const handleFilterChange = (next: FilterValues) => {
    setFilters(next);
    setOffset(0);
    setExpandedId(null);
  };

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

  const { data, isLoading, error, refetch } = useAnalyses(
    pageSize,
    offset,
    refreshKey,
    filters.repository || undefined,
    confidenceRange.min !== null ? String(confidenceRange.min) : undefined,
    confidenceRange.max !== null ? String(confidenceRange.max) : undefined
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

      <FilterBar variant="analyses" filters={filters} onFilterChange={handleFilterChange} />

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
                  {filters.repository || filters.minConfidence
                    ? "No matching analyses"
                    : "No analyses yet"}
                </EmptyTitle>
                <EmptyDescription>
                  {filters.repository || filters.minConfidence
                    ? "Try adjusting your filters to find what you're looking for."
                    : "When Kenchi detects CI/CD failures, it automatically runs root cause analysis. Results will appear here."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-gray-50/80 dark:bg-gray-800/50">
                    <TableRow>
                      <TableHead className="w-8" />
                      <SortableTableHead
                        label="Time"
                        column="createdAt"
                        currentSort={sort}
                        onSort={handleSort}
                      />
                      <TableHead>Repository</TableHead>
                      <TableHead>Summary</TableHead>
                      <SortableTableHead
                        label="Confidence"
                        column="confidence"
                        currentSort={sort}
                        onSort={handleSort}
                      />
                      <TableHead>Event</TableHead>
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

              {totalPages > 1 && (
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
              )}
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
