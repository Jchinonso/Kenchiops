/**
 * CI/CD Analyses Page
 *
 * Lists recent CI/CD analysis results with pagination.
 * Data comes from the dashboard API (analyses scoped to tenant).
 * Rows expand inline to show recommended actions and confidence signals.
 */

import { Fragment, useState, useEffect } from "react";
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
import { Search, AlertTriangle, ChevronRight } from "lucide-react";
import { useAnalyses, type AnalysisRecord } from "@/hooks/useDashboardData";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  getConfidenceLabel,
  getConfidenceStyle,
  formatTimestamp,
  truncateText,
  extractRepoFromKey,
} from "@/lib/formatters";
import { TableSkeleton } from "@/components/TableSkeleton";
import { PaginationControls } from "@/components/PaginationControls";
import { FilterBar, type FilterValues } from "@/components/FilterBar";
import { AnalysisDetailPanel } from "@/pages/AnalysisDetailPanel";

// ==================== Helpers ====================

const PAGE_SIZE = 20;

// ==================== Sub-components ====================

interface AnalysisRowProps {
  readonly analysis: AnalysisRecord;
  readonly isExpanded: boolean;
  readonly onClick: () => void;
}

const AnalysisRow = ({ analysis, isExpanded, onClick }: AnalysisRowProps) => {
  const repo = extractRepoFromKey(analysis.aggregationKey, analysis.fullAnalysis);
  const confidence = Math.round(analysis.diagnosisConfidence * 100);

  return (
    <TableRow onClick={onClick} className="cursor-pointer hover:bg-gray-50 transition-colors">
      <TableCell className="w-8">
        <ChevronRight
          className={cn("w-4 h-4 text-gray-400 transition-transform", isExpanded && "rotate-90")}
        />
      </TableCell>
      <TableCell className="text-gray-500 text-xs">{formatTimestamp(analysis.createdAt)}</TableCell>
      <TableCell className="text-gray-700 font-medium text-xs">{repo}</TableCell>
      <TableCell className="max-w-xs">
        <p className="text-sm text-gray-900 truncate">{truncateText(analysis.summary, 80)}</p>
      </TableCell>
      <TableCell className="max-w-xs">
        <p className="text-sm text-gray-600 truncate">
          {analysis.identifiedCause ? truncateText(analysis.identifiedCause, 60) : "--"}
        </p>
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={cn("text-xs", getConfidenceStyle(analysis.diagnosisConfidence))}
        >
          {getConfidenceLabel(analysis.diagnosisConfidence)} ({confidence}%)
        </Badge>
      </TableCell>
      <TableCell>
        {analysis.eventId ? (
          <Link
            to="/dashboard/cicd/failures"
            className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 transition-colors"
            onClick={(event) => event.stopPropagation()}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span className="text-xs underline">Linked</span>
          </Link>
        ) : (
          <span className="text-xs text-gray-400">--</span>
        )}
      </TableCell>
    </TableRow>
  );
};

// ==================== Expanded Row ====================

interface ExpandedAnalysisRowProps {
  readonly analysis: AnalysisRecord;
  readonly onViewDetails: () => void;
}

const ExpandedAnalysisRow = ({ analysis, onViewDetails }: ExpandedAnalysisRowProps) => {
  const hasActions = analysis.recommendedActions !== null && analysis.recommendedActions.length > 0;
  const hasSignals =
    analysis.confidenceSignals !== null && Object.keys(analysis.confidenceSignals).length > 0;

  return (
    <TableRow className="hover:bg-gray-50">
      <TableCell colSpan={7} className="bg-gray-50 border-b p-0">
        <div className="p-4 space-y-3">
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Recommended Actions
            </h4>
            {hasActions ? (
              <ol className="list-decimal list-inside space-y-1">
                {(analysis.recommendedActions ?? []).map((action, index) => (
                  <li key={index} className="text-sm text-gray-900">
                    {action}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-gray-400">No recommended actions.</p>
            )}
          </div>

          {hasSignals && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Confidence Signals
              </h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {Object.entries(analysis.confidenceSignals ?? {}).map(([label, value]) => (
                  <Fragment key={label}>
                    <span className="text-xs text-gray-500">{label}</span>
                    <span className="text-sm text-gray-900">{String(value)}</span>
                  </Fragment>
                ))}
              </div>
            </div>
          )}

          <div>
            <button
              type="button"
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              onClick={(event) => {
                event.stopPropagation();
                onViewDetails();
              }}
            >
              View Full Details
            </button>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
};

// ==================== Main Component ====================

interface CICDAnalysesProps {
  readonly refreshKey?: number;
  readonly searchQuery?: string;
}

export const CICDAnalyses = ({ refreshKey = 0, searchQuery }: CICDAnalysesProps) => {
  const [offset, setOffset] = useState(0);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
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
  };

  const { data, isLoading, error } = useAnalyses(
    PAGE_SIZE,
    offset,
    refreshKey,
    filters.repository || undefined,
    filters.minConfidence || undefined
  );

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
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">CI/CD Analyses</h1>
        <p className="text-sm text-gray-500 mt-1">
          AI-powered root cause analysis of your CI/CD failures.
        </p>
      </div>

      <FilterBar variant="analyses" filters={filters} onFilterChange={handleFilterChange} />

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-indigo-500" />
            <CardTitle>Analysis Results</CardTitle>
          </div>
          <CardDescription>
            {total > 0
              ? `${total} total analys${total > 1 ? "es" : "is"}`
              : "No analyses recorded yet"}
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
                  <Search className="w-6 h-6" />
                </EmptyMedia>
                <EmptyTitle>No analyses yet</EmptyTitle>
                <EmptyDescription>
                  When Kenchi detects CI/CD failures, it automatically runs root cause analysis.
                  Results will appear here.
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
                    <TableHead>Summary</TableHead>
                    <TableHead>Root Cause</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Event</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((analysis) => (
                    <Fragment key={analysis.id}>
                      <AnalysisRow
                        analysis={analysis}
                        isExpanded={expandedId === analysis.id}
                        onClick={() =>
                          setExpandedId((prev) => (prev === analysis.id ? null : analysis.id))
                        }
                      />
                      {expandedId === analysis.id && (
                        <ExpandedAnalysisRow
                          analysis={analysis}
                          onViewDetails={() => setSelectedAnalysisId(analysis.id)}
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

      <AnalysisDetailPanel
        analysisId={selectedAnalysisId}
        open={selectedAnalysisId !== null}
        onClose={() => setSelectedAnalysisId(null)}
      />
    </div>
  );
};
