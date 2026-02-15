/**
 * CI/CD Failures Page
 *
 * Lists recent CI/CD failure events with pagination.
 * Data comes from the dashboard API (events of type CICD_FAILURE).
 */

import { useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useFailures, type EventRecord } from "@/hooks/useDashboardData";
import { cn } from "@/lib/utils";

// ==================== Helpers ====================

const PAGE_SIZE = 20;

const SEVERITY_STYLES: Readonly<Record<string, string>> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-blue-100 text-blue-700 border-blue-200",
  default: "bg-gray-100 text-gray-700 border-gray-200",
};

const formatTimestamp = (timestamp: string): string =>
  new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const getSeverityStyle = (severity: string | null): string =>
  SEVERITY_STYLES[severity ?? "default"] ?? SEVERITY_STYLES.default;

const getPayloadString = (payload: Readonly<Record<string, unknown>>, key: string): string =>
  typeof payload[key] === "string" ? String(payload[key]) : "--";

// ==================== Sub-components ====================

const TableSkeleton = () => (
  <div className="space-y-3 p-4">
    {Array.from({ length: 5 }, (_, idx) => (
      <Skeleton key={idx} className="h-12 w-full" />
    ))}
  </div>
);

interface FailureRowProps {
  readonly event: EventRecord;
}

const FailureRow = ({ event }: FailureRowProps) => {
  const repository = getPayloadString(event.payload, "repository");
  const checkName = getPayloadString(event.payload, "checkName");
  const conclusion = getPayloadString(event.payload, "conclusion");
  const headSha = getPayloadString(event.payload, "headSha");
  const shortSha = headSha !== "--" ? headSha.slice(0, 7) : "--";

  return (
    <TableRow>
      <TableCell className="text-gray-500 text-xs">{formatTimestamp(event.timestamp)}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{repository}</span>
          {repository !== "--" && (
            <a
              href={`https://github.com/${repository}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-indigo-500 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </TableCell>
      <TableCell className="text-gray-700">{checkName}</TableCell>
      <TableCell>
        <Badge variant="outline" className={cn("text-xs", getSeverityStyle(event.severity))}>
          {event.severity ?? "unknown"}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-xs bg-gray-50 text-gray-600 border-gray-200">
          {conclusion}
        </Badge>
      </TableCell>
      <TableCell className="text-gray-500 font-mono text-xs">{shortSha}</TableCell>
    </TableRow>
  );
};

// ==================== Main Component ====================

export const CICDFailures = () => {
  const [offset, setOffset] = useState(0);
  const { data, isLoading, error } = useFailures(PAGE_SIZE, offset);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const hasItems = Boolean(items.length);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  const goNext = () => setOffset((prev) => prev + PAGE_SIZE);
  const goPrev = () => setOffset((prev) => Math.max(0, prev - PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">CI/CD Failures</h1>
        <p className="text-sm text-gray-500 mt-1">
          Recent build and check failures from your connected repositories.
        </p>
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <CardTitle>Failure Events</CardTitle>
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
            <div className="p-8 text-center">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : !hasItems ? (
            <Empty className="py-12 border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <AlertTriangle className="w-6 h-6" />
                </EmptyMedia>
                <EmptyTitle>No failures yet</EmptyTitle>
                <EmptyDescription>
                  CI/CD failures from your connected repositories will appear here once Kenchi
                  detects them.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Repository</TableHead>
                    <TableHead>Check Name</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Commit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((event) => (
                    <FailureRow key={event.id} event={event} />
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <span className="text-sm text-gray-500">
                    Page {currentPage} of {totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={goPrev}
                      disabled={!hasPrev}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Prev
                    </button>
                    <button
                      onClick={goNext}
                      disabled={!hasNext}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
