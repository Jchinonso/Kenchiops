/**
 * Active Incidents Page
 *
 * Lists incoming incidents with severity, triage status, and AI summaries.
 * Rows expand inline to show triage results (lazy-loaded).
 * Follows the same Card > Table pattern as CICDAnalyses.tsx.
 */

import { Fragment, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableBody, TableCaption } from "@/components/ui/table";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Siren, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useIncidents, useActiveCountsBySource } from "@/hooks/useIncidentData";
import { useSubscriptionUsage } from "@/hooks/useSubscription";
import { FeatureLocked } from "@/components/FeatureLocked";
import { getIncidentSeverityRank, titleCase } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/TableSkeleton";
import { PaginationControls } from "@/components/PaginationControls";
import {
  FilterBar,
  loadSavedFilters,
  saveFilters,
  type FilterValues,
} from "@/components/FilterBar";
import {
  SortableTableHead,
  IncidentRow,
  ExpandedIncidentRow,
  type SortConfig,
} from "@/components/IncidentTableRows";
import { IncidentDetailPanel } from "@/pages/IncidentDetailPanel";
import { findDuplicateIds } from "@/lib/duplicateDetection";

// ==================== Constants ====================

const PAGE_SIZE = 20;

const cycleSortDirection = (current: "asc" | "desc" | null): "asc" | "desc" | null =>
  current === null ? "asc" : current === "asc" ? "desc" : null;

// ==================== Main Component ====================

interface ActiveIncidentsProps {
  readonly refreshKey?: number;
}

export const ActiveIncidents = ({ refreshKey = 0 }: ActiveIncidentsProps) => {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const { data: usageData } = useSubscriptionUsage(refreshKey);
  const isAnyLimitReached = usageData
    ? Object.values(usageData.usage).some(
        (usage) => usage.limited && usage.limit !== null && usage.current >= usage.limit
      )
    : false;
  const [searchParams, setSearchParams] = useSearchParams();
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortConfig>({ column: "", direction: null });
  const [filters, setFilters] = useState<FilterValues>(() => {
    const saved = loadSavedFilters("incidents", tenantId || undefined);
    return {
      repository: "",
      minConfidence: "",
      severity: searchParams.get("severity") ?? saved?.severity ?? "",
      status: searchParams.get("status") ?? saved?.status ?? "",
      source: searchParams.get("source") ?? saved?.source ?? "",
      timeRange: searchParams.get("timeRange") ?? saved?.timeRange ?? "",
    };
  });

  const { data: activeCountsBySource } = useActiveCountsBySource(tenantId, refreshKey);
  const hasSourceTabs = (activeCountsBySource?.length ?? 0) > 1;
  const [activeSourceTab, setActiveSourceTab] = useState<string>("all");

  const handleSourceTabChange = useCallback(
    (source: string) => {
      setActiveSourceTab(source);
      setOffset(0);
      setExpandedId(null);
      const nextSource = source === "all" ? "" : source;
      setFilters((prev) => ({ ...prev, source: nextSource }));
      const params = new URLSearchParams();
      if (filters.severity) {
        params.set("severity", filters.severity);
      }
      if (filters.status) {
        params.set("status", filters.status);
      }
      if (nextSource) {
        params.set("source", nextSource);
      }
      setSearchParams(params, { replace: true });
      saveFilters("incidents", { ...filters, source: nextSource }, tenantId || undefined);
    },
    [filters, setSearchParams]
  );

  const handleFilterChange = useCallback(
    (next: FilterValues) => {
      setFilters(next);
      setOffset(0);
      setExpandedId(null);
      saveFilters("incidents", next, tenantId || undefined);
      const params = new URLSearchParams();
      if (next.severity) {
        params.set("severity", next.severity);
      }
      if (next.status) {
        params.set("status", next.status);
      }
      if (next.source) {
        params.set("source", next.source);
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

  const { data, isLoading, error, refetch } = useIncidents({
    tenantId,
    limit: pageSize,
    offset,
    refreshKey,
    severity: filters.severity || undefined,
    status: filters.status || undefined,
    source: filters.source || undefined,
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
      if (column === "receivedAt") {
        return (
          multiplier * (new Date(left.receivedAt).getTime() - new Date(right.receivedAt).getTime())
        );
      }
      if (column === "severity") {
        return (
          multiplier *
          (getIncidentSeverityRank(left.severity) - getIncidentSeverityRank(right.severity))
        );
      }
      return 0;
    });
  }, [items, sort]);

  const duplicateIds = useMemo(() => findDuplicateIds(sortedItems), [sortedItems]);

  const hasItems = Boolean(items.length);
  const currentPage = Math.floor(offset / pageSize) + 1;
  const totalPages = Math.ceil(total / pageSize);
  const hasPrev = offset > 0;
  const hasNext = offset + pageSize < total;
  const hasActiveFilters =
    filters.severity !== "" || (filters.status ?? "") !== "" || (filters.source ?? "") !== "";

  const goNext = () => {
    setOffset((prev) => prev + pageSize);
    setExpandedId(null);
  };
  const goPrev = () => {
    setOffset((prev) => Math.max(0, prev - pageSize));
    setExpandedId(null);
  };

  if (!tenantId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
            Active Incidents
          </h1>
        </div>
        <Card>
          <CardContent className="py-12">
            <Empty className="border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Siren className="w-6 h-6" />
                </EmptyMedia>
                <EmptyTitle>No tenant configured</EmptyTitle>
                <EmptyDescription>
                  Connect your GitHub organization in Settings to enable incident triage.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pageContent = (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
          Active Incidents
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          AI-triaged alerts from your monitoring tools with severity classification and routing.
        </p>
      </div>

      {hasSourceTabs && activeCountsBySource && (
        <div
          className="flex flex-wrap items-center gap-2"
          role="tablist"
          aria-label="Filter by source"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeSourceTab === "all"}
            onClick={() => handleSourceTabChange("all")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-full border transition-colors",
              activeSourceTab === "all"
                ? "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300"
                : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
            )}
          >
            All ({activeCountsBySource.reduce((sum, entry) => sum + entry.activeCount, 0)})
          </button>
          {activeCountsBySource.map((entry) => (
            <button
              key={entry.source}
              type="button"
              role="tab"
              aria-selected={activeSourceTab === entry.source}
              onClick={() => handleSourceTabChange(entry.source)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-full border transition-colors",
                activeSourceTab === entry.source
                  ? "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300"
                  : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
              )}
            >
              {titleCase(entry.source)} ({entry.activeCount})
            </button>
          ))}
        </div>
      )}

      <FilterBar
        variant="incidents"
        filters={filters}
        onFilterChange={handleFilterChange}
        hideSource={hasSourceTabs}
      />

      <div aria-live="polite" className="sr-only">
        {isLoading
          ? "Loading incidents..."
          : error
            ? "Error loading incidents"
            : `Showing ${items.length} of ${total} incidents`}
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <Siren className="w-5 h-5 text-indigo-500" />
            <CardTitle>Incidents</CardTitle>
          </div>
          <CardDescription>
            {total > 0
              ? `${total} total incident${total > 1 ? "s" : ""}`
              : "No incidents recorded yet"}
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
                  <Siren className="w-6 h-6" />
                </EmptyMedia>
                <EmptyTitle>
                  {hasActiveFilters ? "No matching incidents" : "No incidents yet"}
                </EmptyTitle>
                <EmptyDescription>
                  {hasActiveFilters
                    ? "Try adjusting your filters to find what you're looking for."
                    : "When alerts arrive from PagerDuty or other monitoring tools, they will be triaged and shown here."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableCaption className="sr-only">
                    Active incidents table showing severity, title, service, and triage status
                  </TableCaption>
                  <TableHeader className="bg-gray-50/80 dark:bg-gray-800/50">
                    <tr>
                      <TableHead scope="col" className="w-8" />
                      <SortableTableHead
                        label="Severity"
                        column="severity"
                        currentSort={sort}
                        onSort={handleSort}
                      />
                      <TableHead scope="col">Title</TableHead>
                      <TableHead scope="col">Service</TableHead>
                      <TableHead scope="col">Environment</TableHead>
                      <TableHead scope="col">Source</TableHead>
                      <TableHead scope="col">Status</TableHead>
                      <SortableTableHead
                        label="Time"
                        column="receivedAt"
                        currentSort={sort}
                        onSort={handleSort}
                      />
                    </tr>
                  </TableHeader>
                  <TableBody>
                    {sortedItems.map((incident) => (
                      <Fragment key={incident.id}>
                        <IncidentRow
                          incident={incident}
                          isExpanded={expandedId === incident.id}
                          isDuplicate={duplicateIds.has(incident.id)}
                          onClick={() =>
                            setExpandedId((prev) => (prev === incident.id ? null : incident.id))
                          }
                        />
                        {expandedId === incident.id && (
                          <ExpandedIncidentRow
                            incidentId={incident.id}
                            onViewDetails={() => setSelectedIncidentId(incident.id)}
                            onRefresh={refetch}
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

      <IncidentDetailPanel
        incidentId={selectedIncidentId}
        open={selectedIncidentId !== null}
        onClose={() => setSelectedIncidentId(null)}
        onRefresh={refetch}
      />
    </div>
  );

  if (isAnyLimitReached && usageData && !isLoading) {
    return (
      <FeatureLocked
        description="You have reached your plan's usage limits. Upgrade to continue viewing incidents."
        usage={usageData.usage}
      >
        {pageContent}
      </FeatureLocked>
    );
  }

  return pageContent;
};
