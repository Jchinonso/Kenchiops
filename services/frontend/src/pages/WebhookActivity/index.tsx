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
import { useIsMobile } from "@/hooks/use-mobile";
import { TableSkeleton } from "@/components/TableSkeleton";
import { PaginationControls } from "@/components/PaginationControls";
import { MobileDataCard } from "@/components/MobileDataCard";
import {
  SortableTableHead,
  cycleSortDirection,
  type SortConfig,
} from "@/components/SortableTableHead";
import { PAGE_SIZE, getStatusStyle } from "./constants";
import { formatDuration } from "./helpers";
import { WebhookRow } from "./WebhookRow";
import { ExpandedWebhookRow } from "./ExpandedWebhookRow";
// ==================== Main Component ====================

export const WebhookActivity = () => {
  const isMobile = useIsMobile();
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

  const { data, isLoading, error, refetch } = useWebhookActivity({
    limit: pageSize,
    offset,
    status: statusFilter || undefined,
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

  const renderDataContent = (): React.ReactNode => {
    if (isMobile) {
      return (
        <>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800 p-3 space-y-3">
            {sortedItems.map((activity) => {
              const isExpanded = expandedId === activity.id;
              return (
                <MobileDataCard
                  key={activity.id}
                  title={activity.eventType}
                  subtitle={
                    activity.deliveryId.length > 20
                      ? `${activity.deliveryId.slice(0, 20)}...`
                      : activity.deliveryId
                  }
                  timestamp={activity.createdAt}
                  badges={[
                    {
                      label: titleCase(activity.status),
                      className: getStatusStyle(activity.status),
                    },
                  ]}
                  fields={[
                    { label: "Source", value: titleCase(activity.source) },
                    { label: "Duration", value: formatDuration(activity.processingTimeMs) },
                  ]}
                  onClick={() =>
                    setExpandedId((prev) => (prev === activity.id ? null : activity.id))
                  }
                  isExpanded={isExpanded}
                  expandedContent={
                    isExpanded ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 gap-y-1.5">
                          {[
                            ["Delivery ID", activity.deliveryId],
                            ["Event Type", activity.eventType],
                            ["Source", titleCase(activity.source)],
                            ["Status", titleCase(activity.status)],
                            ["Duration", formatDuration(activity.processingTimeMs)],
                          ].map(([label, value]) => (
                            <div key={label} className="flex items-baseline gap-2">
                              <span className="text-xs text-zinc-500 dark:text-zinc-400 shrink-0">
                                {label}:
                              </span>
                              <span
                                className={cn(
                                  "text-sm text-zinc-900 dark:text-zinc-100",
                                  label === "Delivery ID" && "font-mono text-xs break-all"
                                )}
                              >
                                {value}
                              </span>
                            </div>
                          ))}
                        </div>
                        {activity.errorMessage && (
                          <div>
                            <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                              Error
                            </h4>
                            <p className="text-sm text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap break-words">
                              {activity.errorMessage.length > 300
                                ? `${activity.errorMessage.slice(0, 300)}...`
                                : activity.errorMessage}
                            </p>
                          </div>
                        )}
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
    );
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

      {/* Status filter — scrollable on mobile */}
      <div className="flex items-center gap-2 overflow-x-auto">
        <span className="text-sm text-zinc-500 dark:text-zinc-400 flex-shrink-0">Status:</span>
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
              "px-3 py-1 min-h-[36px] text-xs font-medium rounded-full border transition-colors flex-shrink-0",
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
            renderDataContent()
          )}
        </CardContent>
      </Card>
    </div>
  );
};
