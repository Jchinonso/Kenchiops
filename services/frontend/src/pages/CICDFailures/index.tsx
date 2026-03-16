/**
 * CI/CD Failures Page
 *
 * Lists recent CI/CD failure events with pagination.
 * Data comes from the dashboard API (events of type CICD_FAILURE).
 * Rows expand inline to show full payload details and links.
 */

import { Fragment, useState, useMemo, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import { AlertTriangle, Search, Download, RefreshCw, ExternalLink } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useFailures, useAnalysisStatusByEvents } from "@/hooks/useDashboardData";
import {
  getPayloadString,
  getSeverityStyle,
  getConfidenceLabel,
  getConfidenceStyle,
  titleCase,
  formatTimestamp,
} from "@/lib/formatters";
import { buildSearchParams } from "@/lib/utils";
import { buildSafeGitHubUrl } from "@/lib/urlSafety";
import { useIsMobile } from "@/hooks/use-mobile";
import { TableSkeleton } from "@/components/TableSkeleton";
import { PaginationControls } from "@/components/PaginationControls";
import { MobileFilterDrawer } from "@/components/MobileFilterDrawer";
import { MobileDataCard } from "@/components/MobileDataCard";
import {
  timeRangeToSince,
  loadSavedFilters,
  saveFilters,
  type FilterValues,
} from "@/components/FilterBar";
import { exportFailuresToCSV } from "@/lib/csvExport";
import {
  SortableTableHead,
  cycleSortDirection,
  type SortConfig,
} from "@/components/SortableTableHead";
import { PAGE_SIZE } from "./constants";
import { getSeverityRank } from "./helpers";
import { FailureRow } from "./FailureRow";
import { ExpandedFailureRow } from "./ExpandedFailureRow";
// ==================== Main Component ====================

export const CICDFailures = () => {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? undefined;
  const [searchParams, setSearchParams] = useSearchParams();
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortConfig>({ column: "", direction: null });
  const [filters, setFilters] = useState<FilterValues>(() => {
    const saved = loadSavedFilters("failures", tenantId);
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
      saveFilters("failures", next, tenantId);
      setSearchParams(buildSearchParams(next), { replace: true });
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

  const since = useMemo(() => timeRangeToSince(filters.timeRange), [filters.timeRange]);

  const { data, isLoading, error, refetch } = useFailures({
    limit: pageSize,
    offset,
    repository: filters.repository || undefined,
    severity: filters.severity || undefined,
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
        case "timestamp":
          return (
            multiplier * (new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime())
          );
        case "severity":
          return multiplier * (getSeverityRank(left.severity) - getSeverityRank(right.severity));
        case "conclusion": {
          const leftVal = getPayloadString(left.payload, "conclusion");
          const rightVal = getPayloadString(right.payload, "conclusion");
          return multiplier * leftVal.localeCompare(rightVal);
        }
        default:
          return 0;
      }
    });
  }, [items, sort]);

  const eventIds = useMemo(() => items.map((item) => item.id), [items]);
  const { data: analysisStatus } = useAnalysisStatusByEvents(eventIds);
  const hasItems = Boolean(items.length);
  const hasActiveFilters = Boolean(filters.repository || filters.severity || filters.timeRange);
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
              {hasActiveFilters ? (
                <Search className="w-6 h-6" />
              ) : (
                <AlertTriangle className="w-6 h-6" />
              )}
            </EmptyMedia>
            <EmptyTitle>{hasActiveFilters ? "No matching failures" : "No failures yet"}</EmptyTitle>
            <EmptyDescription>
              {hasActiveFilters
                ? "Try adjusting your filters to find what you're looking for."
                : "CI/CD failures from your connected repositories will appear here once Kenchi detects them."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    if (isMobile) {
      return (
        <>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800 p-3 space-y-3">
            {sortedItems.map((event) => {
              const repository = getPayloadString(event.payload, "repository");
              const checkName = getPayloadString(event.payload, "checkName");
              const conclusion = getPayloadString(event.payload, "conclusion");
              const headSha = getPayloadString(event.payload, "headSha");
              const isExpanded = expandedId === event.id;
              const status = analysisStatus?.[event.id];

              return (
                <MobileDataCard
                  key={event.id}
                  title={repository}
                  subtitle={checkName}
                  timestamp={event.timestamp}
                  badges={[
                    {
                      label: titleCase(event.severity ?? "unknown"),
                      className: getSeverityStyle(event.severity),
                    },
                    {
                      label: conclusion,
                      className:
                        "bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700",
                    },
                    ...(status
                      ? [
                          {
                            label: getConfidenceLabel(status.confidence),
                            className: getConfidenceStyle(status.confidence),
                          },
                        ]
                      : [
                          {
                            label: "Pending",
                            className:
                              "bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700",
                          },
                        ]),
                  ]}
                  fields={(() => {
                    if (headSha === "--") {
                      return undefined;
                    }
                    const mobileCommitUrl = buildSafeGitHubUrl(repository, `/commit/${headSha}`);
                    return [
                      {
                        label: "Commit",
                        value: mobileCommitUrl ? (
                          <a
                            href={mobileCommitUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono hover:text-indigo-500 underline decoration-dotted underline-offset-2"
                            onClick={(clickEvent) => clickEvent.stopPropagation()}
                          >
                            {headSha.slice(0, 7)}
                          </a>
                        ) : (
                          <span className="font-mono">{headSha.slice(0, 7)}</span>
                        ),
                      },
                    ];
                  })()}
                  onClick={() => setExpandedId((prev) => (prev === event.id ? null : event.id))}
                  isExpanded={isExpanded}
                  expandedContent={
                    isExpanded ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 gap-y-1.5">
                          {[
                            ["Repository", repository],
                            ["Check Name", checkName],
                            ["Branch", getPayloadString(event.payload, "branch")],
                            ["Conclusion", conclusion],
                            [
                              "Detected At",
                              event.timestamp ? formatTimestamp(event.timestamp) : "--",
                            ],
                          ]
                            .filter(([, value]) => value !== "--")
                            .map(([label, value]) => (
                              <div key={label} className="flex items-baseline gap-2">
                                <span className="text-xs text-zinc-500 dark:text-zinc-400 shrink-0">
                                  {label}:
                                </span>
                                <span className="text-sm text-zinc-900 dark:text-zinc-100">
                                  {value}
                                </span>
                              </div>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {(() => {
                            const expandedCommitUrl = buildSafeGitHubUrl(
                              repository,
                              `/commit/${headSha}`
                            );
                            return expandedCommitUrl && headSha !== "--" ? (
                              <a
                                href={expandedCommitUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md"
                                onClick={(clickEvent) => clickEvent.stopPropagation()}
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                View on GitHub
                              </a>
                            ) : null;
                          })()}
                          {status && (
                            <Link
                              to={`/dashboard/cicd/analyses/${status.analysisId}`}
                              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 rounded-md"
                              onClick={(clickEvent) => clickEvent.stopPropagation()}
                            >
                              <Search className="w-3.5 h-3.5" />
                              View Analysis
                            </Link>
                          )}
                        </div>
                      </div>
                    ) : undefined
                  }
                />
              );
            })}
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
    }

    return (
      <>
        <div className="overflow-x-auto">
          <Table>
            <TableCaption className="sr-only">
              CI/CD failure events table showing repository, severity, and analysis status
            </TableCaption>
            <TableHeader className="bg-zinc-50/80 dark:bg-zinc-800/50">
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
                    onClick={() => setExpandedId((prev) => (prev === event.id ? null : event.id))}
                  />
                  {expandedId === event.id && (
                    <ExpandedFailureRow event={event} analysisStatus={analysisStatus?.[event.id]} />
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-display font-bold text-zinc-900 dark:text-zinc-100">
          CI/CD Failures
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Recent build and check failures from your connected repositories.
        </p>
      </div>

      <MobileFilterDrawer
        variant="failures"
        filters={filters}
        onFilterChange={handleFilterChange}
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] text-xs font-medium text-zinc-600 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors self-start sm:self-auto"
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
        <CardContent className="p-0">{renderCardContent()}</CardContent>
      </Card>
    </div>
  );
};
