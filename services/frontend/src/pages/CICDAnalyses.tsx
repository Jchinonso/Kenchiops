/**
 * CI/CD Analyses Page
 *
 * Lists recent CI/CD analysis results with pagination.
 * Data comes from the dashboard API (analyses scoped to tenant).
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
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Search, AlertTriangle } from "lucide-react";
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
import { AnalysisDetailPanel } from "@/pages/AnalysisDetailPanel";

// ==================== Helpers ====================

const PAGE_SIZE = 20;

// ==================== Sub-components ====================

interface AnalysisRowProps {
  readonly analysis: AnalysisRecord;
  readonly onClick: () => void;
}

const AnalysisRow = ({ analysis, onClick }: AnalysisRowProps) => {
  const repo = extractRepoFromKey(analysis.aggregationKey, analysis.fullAnalysis);
  const confidence = Math.round(analysis.diagnosisConfidence * 100);

  return (
    <TableRow onClick={onClick} className="cursor-pointer hover:bg-gray-50 transition-colors">
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

// ==================== Main Component ====================

interface CICDAnalysesProps {
  readonly refreshKey?: number;
}

export const CICDAnalyses = ({ refreshKey = 0 }: CICDAnalysesProps) => {
  const [offset, setOffset] = useState(0);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const { data, isLoading, error } = useAnalyses(PAGE_SIZE, offset, refreshKey);

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
                    <AnalysisRow
                      key={analysis.id}
                      analysis={analysis}
                      onClick={() => setSelectedAnalysisId(analysis.id)}
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

      <AnalysisDetailPanel
        analysisId={selectedAnalysisId}
        open={selectedAnalysisId !== null}
        onClose={() => setSelectedAnalysisId(null)}
      />
    </div>
  );
};
