/**
 * Investigations List Page
 *
 * Lists investigations with status, description, service, confidence, and duration.
 * Follows the same Card > Table pattern as ActiveIncidents.
 * Rows navigate to the investigation detail page.
 */

import { useState, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableCaption } from "@/components/ui/table";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Search, RefreshCw, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useInvestigations } from "@/hooks/useInvestigationData";
import {
  getInvestigationStatusStyle,
  formatDuration,
  titleCase,
  truncateText,
} from "@/lib/formatters";
import { useIsMobile } from "@/hooks/use-mobile";
import { TableSkeleton } from "@/components/TableSkeleton";
import { PaginationControls } from "@/components/PaginationControls";
import { MobileDataCard } from "@/components/MobileDataCard";
import { MobileFilterDrawer } from "@/components/MobileFilterDrawer";
import { loadSavedFilters, saveFilters, type FilterValues } from "@/components/FilterBarUtils";
import { InvestigationTableRow } from "./InvestigationTableRow";
import { PAGE_SIZE } from "./constants";

// ==================== Main Component ====================

export const Investigations = () => {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const navigate = useNavigate();
  const tenantId = user?.tenantId ?? "";
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [filters, setFilters] = useState<FilterValues>(() => {
    const saved = loadSavedFilters("investigations", tenantId || undefined);
    return {
      repository: "",
      minConfidence: "",
      severity: "",
      status: saved?.status ?? "",
      timeRange: saved?.timeRange ?? "",
    };
  });

  const handleFilterChange = useCallback(
    (next: FilterValues) => {
      setFilters(next);
      setOffset(0);
      saveFilters("investigations", next, tenantId || undefined);
    },
    [tenantId]
  );

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setOffset(0);
  };

  const { data, isLoading, error, refetch } = useInvestigations(
    tenantId,
    pageSize,
    offset,
    filters.status || undefined
  );

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const total = data?.total ?? 0;

  const hasItems = Boolean(items.length);
  const currentPage = Math.floor(offset / pageSize) + 1;
  const totalPages = Math.ceil(total / pageSize);
  const hasPrev = offset > 0;
  const hasNext = offset + pageSize < total;
  const hasActiveFilters = (filters.status ?? "") !== "" || filters.timeRange !== "";

  const goNext = () => {
    setOffset((prev) => prev + pageSize);
  };
  const goPrev = () => {
    setOffset((prev) => Math.max(0, prev - pageSize));
  };

  if (!tenantId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-zinc-900 dark:text-zinc-100">
            Investigations
          </h1>
        </div>
        <Card>
          <CardContent className="py-12">
            <Empty className="border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Search className="w-6 h-6" />
                </EmptyMedia>
                <EmptyTitle>No tenant configured</EmptyTitle>
                <EmptyDescription>
                  Connect your GitHub organization in Settings to enable investigations.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-zinc-900 dark:text-zinc-100">
            Investigations
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            AI-powered diagnosis of production issues with evidence from monitoring tools and past
            incidents.
          </p>
        </div>
        <Link
          to="/dashboard/incidents/investigations/new"
          className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg transition-colors self-start sm:self-auto flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          New Investigation
        </Link>
      </div>

      <MobileFilterDrawer
        variant="investigations"
        filters={filters}
        onFilterChange={handleFilterChange}
      />

      <div aria-live="polite" className="sr-only">
        {isLoading
          ? "Loading investigations..."
          : error
            ? "Error loading investigations"
            : `Showing ${items.length} of ${total} investigations`}
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-indigo-500" />
            <CardTitle>Investigations</CardTitle>
          </div>
          <CardDescription>
            {total > 0
              ? `${total} total investigation${total > 1 ? "s" : ""}`
              : "No investigations recorded yet"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton columns={6} />
          ) : error ? (
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
          ) : !hasItems ? (
            <Empty className="py-12 border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Search className="w-6 h-6" />
                </EmptyMedia>
                <EmptyTitle>
                  {hasActiveFilters ? "No matching investigations" : "No investigations yet"}
                </EmptyTitle>
                <EmptyDescription>
                  {hasActiveFilters
                    ? "Try adjusting your filters to find what you're looking for."
                    : "Start one to diagnose production issues with AI-powered evidence gathering."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : isMobile ? (
            <>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800 p-3 space-y-3">
                {items.map((investigation) => {
                  const confidence = investigation.diagnosis?.confidence;
                  const confidenceDisplay =
                    confidence !== undefined && confidence !== null
                      ? `${Math.round(confidence * 100)}%`
                      : "--";

                  return (
                    <MobileDataCard
                      key={investigation.id}
                      title={truncateText(investigation.description, 60)}
                      subtitle={investigation.serviceName ?? undefined}
                      timestamp={investigation.createdAt}
                      badges={[
                        {
                          label: titleCase(investigation.status),
                          className: getInvestigationStatusStyle(investigation.status),
                        },
                      ]}
                      fields={[
                        { label: "Confidence", value: confidenceDisplay },
                        {
                          label: "Duration",
                          value:
                            investigation.durationMs !== null
                              ? formatDuration(investigation.durationMs)
                              : "--",
                        },
                      ]}
                      onClick={() =>
                        navigate(`/dashboard/incidents/investigations/${investigation.id}`)
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
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableCaption className="sr-only">
                    Investigations table showing status, description, service, confidence, duration,
                    and time
                  </TableCaption>
                  <TableHeader className="bg-zinc-50/80 dark:bg-zinc-800/50">
                    <tr>
                      <TableHead scope="col">Status</TableHead>
                      <TableHead scope="col">Description</TableHead>
                      <TableHead scope="col">Service</TableHead>
                      <TableHead scope="col">Confidence</TableHead>
                      <TableHead scope="col">Duration</TableHead>
                      <TableHead scope="col">Time</TableHead>
                    </tr>
                  </TableHeader>
                  <tbody>
                    {items.map((investigation) => (
                      <InvestigationTableRow
                        key={investigation.id}
                        investigation={investigation}
                        onClick={() =>
                          navigate(`/dashboard/incidents/investigations/${investigation.id}`)
                        }
                      />
                    ))}
                  </tbody>
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
    </div>
  );
};
