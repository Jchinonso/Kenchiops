/**
 * Webhook Activity Page
 *
 * Lists incoming webhook deliveries with status, timing, and error details.
 * Data comes from the dashboard API (webhook_activity scoped to tenant).
 * Rows expand inline to show error messages and metadata.
 */

import { Fragment, useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableBody, TableRow } from "@/components/ui/table";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Webhook, RefreshCw } from "lucide-react";
import { useWebhookActivity } from "@/hooks/useDashboardData";
import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/formatters";
import { TableSkeleton } from "@/components/TableSkeleton";
import { PaginationControls } from "@/components/PaginationControls";
import { SortableTableHead } from "@/components/SortableTableHead";
import { cycleSortDirection, type SortConfig } from "@/components/SortableTableHeadUtils";
import { PAGE_SIZE } from "./constants";
import { WebhookRow } from "./WebhookRow";
import { ExpandedWebhookRow } from "./ExpandedWebhookRow";
import type { WebhookActivityProps } from "./types";

// ==================== Main Component ====================

export const WebhookActivity = ({ refreshKey = 0 }: WebhookActivityProps) => {
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortConfig>({ column: "", direction: null });
  const [statusFilter, setStatusFilter] = useState("");

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

  const { data, isLoading, error, refetch } = useWebhookActivity(
    pageSize,
    offset,
    refreshKey,
    undefined,
    statusFilter || undefined
  );

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
        case "duration":
          return multiplier * ((left.processingTimeMs ?? 0) - (right.processingTimeMs ?? 0));
        default:
          return 0;
      }
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
        <h1 className="text-xl sm:text-2xl font-display font-bold text-zinc-900 dark:text-zinc-100">
          Webhook Activity
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Incoming webhook deliveries from connected services.
        </p>
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">Status:</span>
        {["", "processed", "skipped", "failed", "ignored"].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setStatusFilter(value);
              setOffset(0);
              setExpandedId(null);
            }}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-full border transition-colors",
              statusFilter === value
                ? "bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800"
                : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700"
            )}
          >
            {value === "" ? "All" : titleCase(value)}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <Webhook className="w-5 h-5 text-indigo-500" />
            <CardTitle>Deliveries</CardTitle>
          </div>
          <CardDescription>
            {total > 0
              ? `${total} total deliver${total > 1 ? "ies" : "y"}`
              : "No webhook activity recorded yet"}
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
                  <Webhook className="w-6 h-6" />
                </EmptyMedia>
                <EmptyTitle>No webhook activity yet</EmptyTitle>
                <EmptyDescription>
                  When GitHub sends webhook events to Kenchi, delivery records will appear here for
                  debugging and visibility.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-zinc-50/80 dark:bg-zinc-800/50">
                    <TableRow>
                      <TableHead scope="col" className="w-8" />
                      <SortableTableHead
                        label="Time"
                        column="createdAt"
                        currentSort={sort}
                        onSort={handleSort}
                      />
                      <TableHead scope="col">Delivery ID</TableHead>
                      <TableHead scope="col">Event Type</TableHead>
                      <TableHead scope="col">Source</TableHead>
                      <TableHead scope="col">Status</TableHead>
                      <SortableTableHead
                        label="Duration"
                        column="duration"
                        currentSort={sort}
                        onSort={handleSort}
                      />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedItems.map((activity) => (
                      <Fragment key={activity.id}>
                        <WebhookRow
                          activity={activity}
                          isExpanded={expandedId === activity.id}
                          onClick={() =>
                            setExpandedId((prev) => (prev === activity.id ? null : activity.id))
                          }
                        />
                        {expandedId === activity.id && <ExpandedWebhookRow activity={activity} />}
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
    </div>
  );
};
