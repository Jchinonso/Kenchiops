/**
 * CI/CD Failures Page
 *
 * Lists recent CI/CD failure events with pagination.
 * Data comes from the dashboard API (events of type CICD_FAILURE).
 * Rows expand inline to show full payload details and links.
 */

import { Fragment, useState, useMemo, useEffect } from "react";
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
import { AlertTriangle, ExternalLink, Search, ChevronRight } from "lucide-react";
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
import { FilterBar, type FilterValues } from "@/components/FilterBar";

// ==================== Helpers ====================

const PAGE_SIZE = 20;

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
  const shortSha = headSha !== "--" ? headSha.slice(0, 7) : "--";

  return (
    <TableRow onClick={onClick} className="cursor-pointer hover:bg-gray-50 transition-colors">
      <TableCell className="w-8">
        <ChevronRight
          className={cn("w-4 h-4 text-gray-400 transition-transform", isExpanded && "rotate-90")}
        />
      </TableCell>
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
              onClick={(linkEvent) => linkEvent.stopPropagation()}
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
          <Link
            to="/dashboard/cicd/analyses"
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
          <span className="text-xs text-gray-400">--</span>
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

  const details: ReadonlyArray<readonly [string, string]> = [
    ["Repository", repository],
    ["Check Name", checkName],
    ["Workflow Name", workflowName],
    ["Branch", branch],
    ["Commit SHA", headSha],
    ["Conclusion", conclusion],
  ];

  return (
    <TableRow className="hover:bg-gray-50">
      <TableCell colSpan={8} className="bg-gray-50 border-b p-0">
        <div className="p-4 space-y-3">
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Full Payload Details
            </h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {details.map(([label, value]) => (
                <Fragment key={label}>
                  <span className="text-xs text-gray-500">{label}</span>
                  <span className="text-sm text-gray-900">{value}</span>
                </Fragment>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {hasGitHubLink && (
              <a
                href={`https://github.com/${repository}/commit/${headSha}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                onClick={(linkEvent) => linkEvent.stopPropagation()}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View on GitHub
              </a>
            )}
            {analysisStatus && (
              <Link
                to="/dashboard/cicd/analyses"
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                onClick={(linkEvent) => linkEvent.stopPropagation()}
              >
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
  readonly searchQuery?: string;
}

export const CICDFailures = ({ refreshKey = 0, searchQuery }: CICDFailuresProps) => {
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterValues>({
    repository: searchQuery ?? "",
    severity: "",
    minConfidence: "",
  });

  // Sync repository filter when searchQuery prop changes
  useEffect(() => {
    setFilters((prev) => ({ ...prev, repository: searchQuery ?? "" }));
  }, [searchQuery]);

  const handleFilterChange = (next: FilterValues) => {
    setFilters(next);
    setOffset(0);
    setExpandedId(null);
  };

  const { data, isLoading, error } = useFailures(
    PAGE_SIZE,
    offset,
    refreshKey,
    filters.repository || undefined,
    filters.severity || undefined
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const eventIds = useMemo(() => items.map((item) => item.id), [items]);
  const { data: analysisStatus } = useAnalysisStatusByEvents(eventIds, refreshKey);
  const hasItems = Boolean(items.length);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  const goNext = () => {
    setOffset((prev) => prev + PAGE_SIZE);
    setExpandedId(null);
  };
  const goPrev = () => {
    setOffset((prev) => Math.max(0, prev - PAGE_SIZE));
    setExpandedId(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">CI/CD Failures</h1>
        <p className="text-sm text-gray-500 mt-1">
          Recent build and check failures from your connected repositories.
        </p>
      </div>

      <FilterBar variant="failures" filters={filters} onFilterChange={handleFilterChange} />

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
                    <TableHead className="w-8" />
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
