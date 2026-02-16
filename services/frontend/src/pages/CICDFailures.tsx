/**
 * CI/CD Failures Page
 *
 * Lists recent CI/CD failure events with pagination.
 * Data comes from the dashboard API (events of type CICD_FAILURE).
 * Rows expand inline to show full payload details and links.
 */

import { Fragment, useState, useMemo, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
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
  AlertTriangle,
  ExternalLink,
  Search,
  ChevronRight,
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Clock,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  useFailures,
  useAnalysisStatusByEvents,
  type EventRecord,
  type AnalysisStatusEntry,
} from "@/hooks/useDashboardData";
import { cn } from "@/lib/utils";
import {
  getConfidenceLabel,
  getConfidenceStyle,
  formatTimestamp,
  getSeverityStyle,
  getPayloadString,
  titleCase,
} from "@/lib/formatters";
import { TimeDisplay } from "@/components/TimeDisplay";
import { TableSkeleton } from "@/components/TableSkeleton";
import { PaginationControls } from "@/components/PaginationControls";
import {
  FilterBar,
  timeRangeToSince,
  loadSavedFilters,
  saveFilters,
  type FilterValues,
} from "@/components/FilterBar";
import { exportFailuresToCSV } from "@/lib/csvExport";

// ==================== Helpers ====================

const PAGE_SIZE = 20;

const getSeverityRank = (severity: string | null): number =>
  severity === "high" ? 0 : severity === "medium" ? 1 : severity === "low" ? 2 : 3;

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

interface FailureRowProps {
  readonly event: EventRecord;
  readonly analysisStatus?: AnalysisStatusEntry | null;
  readonly isExpanded: boolean;
  readonly onClick: () => void;
}

const FailureRow = ({ event, analysisStatus, isExpanded, onClick }: FailureRowProps) => {
  const repository = getPayloadString(event.payload, "repository");
  const checkName = getPayloadString(event.payload, "checkName");
  const conclusion = getPayloadString(event.payload, "conclusion");
  const headSha = getPayloadString(event.payload, "headSha");
  const shortSha = headSha !== "--" ? headSha.slice(0, 7) : null;

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
        <TimeDisplay dateTime={event.timestamp} />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 dark:text-gray-100">{repository}</span>
          {repository !== "--" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={`https://github.com/${repository}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${repository} on GitHub`}
                  className="text-gray-400 hover:text-indigo-500 transition-colors"
                  onClick={(linkEvent) => linkEvent.stopPropagation()}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </TooltipTrigger>
              <TooltipContent>Open on GitHub</TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>
      <TableCell className="text-gray-700 dark:text-gray-300">{checkName}</TableCell>
      <TableCell>
        <Badge variant="outline" className={cn("text-xs", getSeverityStyle(event.severity))}>
          {titleCase(event.severity ?? "unknown")}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className="text-xs bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700"
        >
          {conclusion}
        </Badge>
      </TableCell>
      <TableCell className="text-gray-500 dark:text-gray-400 font-mono text-xs">
        {shortSha && repository !== "--" ? (
          <a
            href={`https://github.com/${repository}/commit/${headSha}`}
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
          <span className="font-sans text-gray-400 dark:text-gray-500">N/A</span>
        )}
      </TableCell>
      <TableCell>
        {analysisStatus ? (
          <Link
            to={`/dashboard/cicd/analyses/${analysisStatus.analysisId}`}
            className="inline-flex items-center gap-1.5 group"
            onClick={(linkEvent) => linkEvent.stopPropagation()}
          >
            <Badge
              variant="outline"
              className={cn(
                "text-xs group-hover:ring-1 group-hover:ring-indigo-300 transition-all",
                getConfidenceStyle(analysisStatus.confidence)
              )}
            >
              <Search className="w-3 h-3 mr-1" />
              {getConfidenceLabel(analysisStatus.confidence)}
            </Badge>
          </Link>
        ) : (
          <Badge
            variant="outline"
            className="text-xs bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700"
          >
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        )}
      </TableCell>
    </TableRow>
  );
};

// ==================== Expanded Row ====================

interface ExpandedFailureRowProps {
  readonly event: EventRecord;
  readonly analysisStatus?: AnalysisStatusEntry | null;
}

const ExpandedFailureRow = ({ event, analysisStatus }: ExpandedFailureRowProps) => {
  const repository = getPayloadString(event.payload, "repository");
  const checkName = getPayloadString(event.payload, "checkName");
  const workflowName = getPayloadString(event.payload, "workflowName");
  const branch = getPayloadString(event.payload, "branch");
  const headSha = getPayloadString(event.payload, "headSha");
  const conclusion = getPayloadString(event.payload, "conclusion");
  const hasGitHubLink = repository !== "--" && headSha !== "--";

  const allDetails: ReadonlyArray<readonly [string, string]> = [
    ["Repository", repository],
    ["Check Name", checkName],
    ["Workflow Name", workflowName],
    ["Branch", branch],
    ["Commit SHA", headSha],
    ["Conclusion", conclusion],
    ["Detected At", event.timestamp ? formatTimestamp(event.timestamp) : "--"],
    ["Ingested At", event.createdAt ? formatTimestamp(event.createdAt) : "--"],
  ];
  const visibleDetails = allDetails.filter(([, value]) => value !== "--");

  return (
    <TableRow className="hover:bg-gray-50 dark:hover:bg-gray-800">
      <TableCell colSpan={8} className="bg-gray-50 dark:bg-gray-800/50 border-b p-0">
        <div className="p-4 space-y-3">
          {event.severity && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">Severity:</span>
              <Badge variant="outline" className={cn("text-xs", getSeverityStyle(event.severity))}>
                {titleCase(event.severity)}
              </Badge>
            </div>
          )}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Payload Details
            </h4>
            {visibleDetails.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                {visibleDetails.map(([label, value]) => (
                  <Fragment key={label}>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
                    <span className="text-sm text-gray-900 dark:text-gray-100">{value}</span>
                  </Fragment>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Limited payload data available for this event.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            {hasGitHubLink && (
              <a
                href={`https://github.com/${repository}/commit/${headSha}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                onClick={(linkEvent) => linkEvent.stopPropagation()}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View on GitHub
              </a>
            )}
            {analysisStatus && (
              <Link
                to={`/dashboard/cicd/analyses/${analysisStatus.analysisId}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 rounded-md hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors"
                onClick={(linkEvent) => linkEvent.stopPropagation()}
              >
                <Search className="w-3.5 h-3.5" />
                View Analysis
              </Link>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
};

// ==================== Main Component ====================

interface CICDFailuresProps {
  readonly refreshKey?: number;
}

export const CICDFailures = ({ refreshKey = 0 }: CICDFailuresProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortConfig>({ column: "", direction: null });
  const [filters, setFilters] = useState<FilterValues>(() => {
    const saved = loadSavedFilters("failures");
    return {
      repository: searchParams.get("repository") ?? saved?.repository ?? "",
      severity: searchParams.get("severity") ?? saved?.severity ?? "",
      minConfidence: "",
      timeRange: searchParams.get("timeRange") ?? saved?.timeRange ?? "",
    };
  });

  const handleFilterChange = useCallback(
    (next: FilterValues) => {
      setFilters(next);
      setOffset(0);
      setExpandedId(null);
      saveFilters("failures", next);
      const params = new URLSearchParams();
      if (next.repository) {
        params.set("repository", next.repository);
      }
      if (next.severity) {
        params.set("severity", next.severity);
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

  const since = useMemo(() => timeRangeToSince(filters.timeRange), [filters.timeRange]);

  const { data, isLoading, error, refetch } = useFailures(
    pageSize,
    offset,
    refreshKey,
    filters.repository || undefined,
    filters.severity || undefined,
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
      if (column === "timestamp") {
        return (
          multiplier * (new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())
        );
      }
      if (column === "severity") {
        return multiplier * (getSeverityRank(left.severity) - getSeverityRank(right.severity));
      }
      if (column === "conclusion") {
        const leftVal = getPayloadString(left.payload, "conclusion");
        const rightVal = getPayloadString(right.payload, "conclusion");
        return multiplier * leftVal.localeCompare(rightVal);
      }
      return 0;
    });
  }, [items, sort]);

  const eventIds = useMemo(() => items.map((item) => item.id), [items]);
  const { data: analysisStatus } = useAnalysisStatusByEvents(eventIds, refreshKey);
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
          CI/CD Failures
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Recent build and check failures from your connected repositories.
        </p>
      </div>

      <FilterBar variant="failures" filters={filters} onFilterChange={handleFilterChange} />

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
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <CardTitle>Failure Events</CardTitle>
            </div>
            {hasItems && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => exportFailuresToCSV(items)}
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
              ? `${total} total failure${total > 1 ? "s" : ""}`
              : "No failures recorded yet"}
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
                  {filters.repository || filters.severity || filters.timeRange ? (
                    <Search className="w-6 h-6" />
                  ) : (
                    <AlertTriangle className="w-6 h-6" />
                  )}
                </EmptyMedia>
                <EmptyTitle>
                  {filters.repository || filters.severity || filters.timeRange
                    ? "No matching failures"
                    : "No failures yet"}
                </EmptyTitle>
                <EmptyDescription>
                  {filters.repository || filters.severity || filters.timeRange
                    ? "Try adjusting your filters to find what you're looking for."
                    : "CI/CD failures from your connected repositories will appear here once Kenchi detects them."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableCaption className="sr-only">
                    CI/CD failure events table showing repository, severity, and analysis status
                  </TableCaption>
                  <TableHeader className="bg-gray-50/80 dark:bg-gray-800/50">
                    <TableRow>
                      <TableHead scope="col" className="w-8" />
                      <SortableTableHead
                        label="Time"
                        column="timestamp"
                        currentSort={sort}
                        onSort={handleSort}
                      />
                      <TableHead scope="col">Repository</TableHead>
                      <TableHead scope="col">Check Name</TableHead>
                      <SortableTableHead
                        label="Severity"
                        column="severity"
                        currentSort={sort}
                        onSort={handleSort}
                      />
                      <SortableTableHead
                        label="Conclusion"
                        column="conclusion"
                        currentSort={sort}
                        onSort={handleSort}
                      />
                      <TableHead scope="col">Commit</TableHead>
                      <TableHead scope="col">Analysis</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedItems.map((event) => (
                      <Fragment key={event.id}>
                        <FailureRow
                          event={event}
                          analysisStatus={analysisStatus?.[event.id]}
                          isExpanded={expandedId === event.id}
                          onClick={() =>
                            setExpandedId((prev) => (prev === event.id ? null : event.id))
                          }
                        />
                        {expandedId === event.id && (
                          <ExpandedFailureRow
                            event={event}
                            analysisStatus={analysisStatus?.[event.id]}
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
    </div>
  );
};
