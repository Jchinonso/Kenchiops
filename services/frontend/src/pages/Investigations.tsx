/**
 * Investigations List Page
 *
 * Lists investigations with status, description, service, confidence, and duration.
 * Follows the same Card > Table pattern as ActiveIncidents.tsx.
 * Rows navigate to the investigation detail page.
 */

import { useState, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Search, RefreshCw, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useInvestigations, type InvestigationRecord } from "@/hooks/useInvestigationData";
import {
  getInvestigationStatusStyle,
  formatDuration,
  formatTimestamp,
  titleCase,
  truncateText,
} from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/TableSkeleton";
import { PaginationControls } from "@/components/PaginationControls";
import { FilterBar } from "@/components/FilterBar";
import { loadSavedFilters, saveFilters, type FilterValues } from "@/components/FilterBarUtils";

// ==================== Constants ====================

const PAGE_SIZE = 20;

// ==================== Sub-components ====================

interface InvestigationTableRowProps {
  readonly investigation: InvestigationRecord;
  readonly onClick: () => void;
}

const InvestigationTableRow = ({ investigation, onClick }: InvestigationTableRowProps) => {
  const confidence = investigation.diagnosis?.confidence;
  const confidenceDisplay =
    confidence !== undefined && confidence !== null ? `${Math.round(confidence * 100)}%` : "--";

  return (
    <TableRow
      className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset"
      onClick={onClick}
      onKeyDown={(keyEvent) => {
        const { key } = keyEvent;
        if (key === "Enter" || key === " ") {
          keyEvent.preventDefault();
          onClick();
        }
      }}
      tabIndex={0}
      role="link"
    >
      <TableCell>
        <span
          className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
            getInvestigationStatusStyle(investigation.status)
          )}
        >
          {titleCase(investigation.status)}
        </span>
      </TableCell>
      <TableCell className="max-w-[300px]">
        <span
          className="text-sm text-zinc-900 dark:text-zinc-100"
          title={investigation.description}
        >
          {truncateText(investigation.description, 80)}
        </span>
      </TableCell>
      <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">
        {investigation.serviceName ?? "--"}
      </TableCell>
      <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">
        {confidenceDisplay}
      </TableCell>
      <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">
        {investigation.durationMs !== null ? formatDuration(investigation.durationMs) : "--"}
      </TableCell>
      <TableCell className="text-sm text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
        {formatTimestamp(investigation.createdAt)}
      </TableCell>
    </TableRow>
  );
};

// ==================== Main Component ====================

interface InvestigationsProps {
  readonly refreshKey?: number;
}

export const Investigations = ({ refreshKey = 0 }: InvestigationsProps) => {
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
    refreshKey,
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
      <div className="flex items-center justify-between">
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
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Investigation
        </Link>
      </div>

      <FilterBar variant="investigations" filters={filters} onFilterChange={handleFilterChange} />

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
                  <TableBody>
                    {items.map((investigation) => (
                      <InvestigationTableRow
                        key={investigation.id}
                        investigation={investigation}
                        onClick={() =>
                          navigate(`/dashboard/incidents/investigations/${investigation.id}`)
                        }
                      />
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
    </div>
  );
};
