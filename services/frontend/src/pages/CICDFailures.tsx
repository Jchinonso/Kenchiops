/**
 * CI/CD Failures Page
 *
 * Lists recent CI/CD failure events with pagination.
 * Data comes from the dashboard API (events of type CICD_FAILURE).
 */

import { useState, useMemo } from "react";
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
import { AlertTriangle, ExternalLink, Search } from "lucide-react";
import {
  useFailures,
  useAnalysisStatusByEvents,
  type EventRecord,
  type AnalysisStatusEntry,
} from "@/hooks/useDashboardData";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  getConfidenceLabel,
  getConfidenceStyle,
  formatTimestamp,
  getSeverityStyle,
  getPayloadString,
} from "@/lib/formatters";
import { TableSkeleton } from "@/components/TableSkeleton";
import { PaginationControls } from "@/components/PaginationControls";

// ==================== Helpers ====================

const PAGE_SIZE = 20;

// ==================== Sub-components ====================

interface FailureRowProps {
  readonly event: EventRecord;
  readonly analysisStatus?: AnalysisStatusEntry | null;
}

const FailureRow = ({ event, analysisStatus }: FailureRowProps) => {
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
      <TableCell>
        {analysisStatus ? (
          <Link to="/dashboard/cicd/analyses" className="inline-flex items-center gap-1.5 group">
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
          <span className="text-xs text-gray-400">--</span>
        )}
      </TableCell>
    </TableRow>
  );
};

// ==================== Main Component ====================

interface CICDFailuresProps {
  readonly refreshKey?: number;
}

export const CICDFailures = ({ refreshKey = 0 }: CICDFailuresProps) => {
  const [offset, setOffset] = useState(0);
  const { data, isLoading, error } = useFailures(PAGE_SIZE, offset, refreshKey);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const eventIds = useMemo(() => items.map((item) => item.id), [items]);
  const { data: analysisStatus } = useAnalysisStatusByEvents(eventIds, refreshKey);
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
                    <TableHead>Analysis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((event) => (
                    <FailureRow
                      key={event.id}
                      event={event}
                      analysisStatus={analysisStatus?.[event.id]}
                    />
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <PaginationControls
                  currentPage={currentPage}
                  totalPages={totalPages}
                  hasPrev={hasPrev}
                  hasNext={hasNext}
                  onPrev={goPrev}
                  onNext={goNext}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
