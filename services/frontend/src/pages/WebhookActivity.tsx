/**
 * Webhook Activity Page
 *
 * Lists incoming webhook deliveries with status, timing, and error details.
 * Data comes from the dashboard API (webhook_activity scoped to tenant).
 * Rows expand inline to show error messages and metadata.
 */

import { Fragment, useState, useMemo, useCallback } from "react";
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
  Webhook,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";
import { useWebhookActivity, type WebhookActivityRecord } from "@/hooks/useDashboardData";
import { cn } from "@/lib/utils";
import { titleCase, formatTimestamp } from "@/lib/formatters";
import { TimeDisplay } from "@/components/TimeDisplay";
import { TableSkeleton } from "@/components/TableSkeleton";
import { PaginationControls } from "@/components/PaginationControls";

// ==================== Constants ====================

const PAGE_SIZE = 20;

const STATUS_STYLES: Readonly<Record<string, string>> = {
  processed:
    "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-200 dark:border-green-800",
  skipped:
    "bg-zinc-50 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
  ignored:
    "bg-zinc-50 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
  failed:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800",
};

const getStatusStyle = (status: string): string => STATUS_STYLES[status] ?? STATUS_STYLES.skipped;

// ==================== Helpers ====================

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
      className="cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        <Icon className={cn("w-3.5 h-3.5", isActive ? "text-indigo-500" : "text-zinc-400")} />
      </div>
    </TableHead>
  );
};

const formatDuration = (ms: number | null): string => {
  if (ms === null) {
    return "--";
  }
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
};

// ==================== Sub-components ====================

interface WebhookRowProps {
  readonly activity: WebhookActivityRecord;
  readonly isExpanded: boolean;
  readonly onClick: () => void;
}

const WebhookRow = ({ activity, isExpanded, onClick }: WebhookRowProps) => (
  <TableRow
    onClick={onClick}
    className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
  >
    <TableCell className="w-8">
      <ChevronRight
        className={cn("w-4 h-4 text-zinc-400 transition-transform", isExpanded && "rotate-90")}
      />
    </TableCell>
    <TableCell className="text-zinc-500 dark:text-zinc-400 text-xs">
      <TimeDisplay dateTime={activity.createdAt} />
    </TableCell>
    <TableCell className="font-mono text-xs text-zinc-700 dark:text-zinc-300 max-w-[160px] truncate">
      {activity.deliveryId}
    </TableCell>
    <TableCell className="text-zinc-900 dark:text-zinc-100 text-sm">{activity.eventType}</TableCell>
    <TableCell className="text-zinc-500 dark:text-zinc-400 text-xs">
      {titleCase(activity.source)}
    </TableCell>
    <TableCell>
      <Badge variant="outline" className={cn("text-xs", getStatusStyle(activity.status))}>
        {titleCase(activity.status)}
      </Badge>
    </TableCell>
    <TableCell className="text-zinc-500 dark:text-zinc-400 text-xs tabular-nums">
      {formatDuration(activity.processingTimeMs)}
    </TableCell>
  </TableRow>
);

// ==================== Expanded Row ====================

interface ExpandedWebhookRowProps {
  readonly activity: WebhookActivityRecord;
}

const ExpandedWebhookRow = ({ activity }: ExpandedWebhookRowProps) => {
  const hasError = activity.errorMessage !== null && activity.errorMessage.length > 0;
  const hasMetadata = Object.keys(activity.metadata).length > 0;
  const [copiedId, setCopiedId] = useState(false);

  const handleCopyDeliveryId = useCallback(async () => {
    await navigator.clipboard.writeText(activity.deliveryId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  }, [activity.deliveryId]);

  const details: ReadonlyArray<readonly [string, string]> = [
    ["Delivery ID", activity.deliveryId],
    ["Event Type", activity.eventType],
    ["Source", titleCase(activity.source)],
    ["Status", titleCase(activity.status)],
    ["Processing Time", formatDuration(activity.processingTimeMs)],
    ["Received At", formatTimestamp(activity.createdAt)],
  ];

  return (
    <TableRow className="hover:bg-zinc-50 dark:hover:bg-zinc-800">
      <TableCell colSpan={7} className="bg-zinc-50 dark:bg-zinc-800/50 border-b p-0">
        <div className="p-4 space-y-3">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Delivery Details
              </h4>
              <button
                type="button"
                onClick={handleCopyDeliveryId}
                className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-indigo-500 dark:text-zinc-500 dark:hover:text-indigo-400 transition-colors"
              >
                {copiedId ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedId ? "Copied!" : "Copy ID"}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {details.map(([label, value]) => (
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
          </div>

          {hasError && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                Error Message
              </h4>
              <p className="text-sm text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap break-words">
                {activity.errorMessage}
              </p>
            </div>
          )}

          {hasMetadata && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                Metadata
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                {Object.entries(activity.metadata).map(([label, value]) => (
                  <div key={label} className="flex items-baseline gap-2">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 shrink-0">
                      {label}:
                    </span>
                    <span className="text-sm text-zinc-900 dark:text-zinc-100">
                      {typeof value === "string" ? value : JSON.stringify(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
};

// ==================== Main Component ====================

interface WebhookActivityProps {
  readonly refreshKey?: number;
}

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
      if (column === "duration") {
        return multiplier * ((left.processingTimeMs ?? 0) - (right.processingTimeMs ?? 0));
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
