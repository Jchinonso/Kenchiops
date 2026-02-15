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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useAnalyses, type AnalysisRecord } from "@/hooks/useDashboardData";
import { cn } from "@/lib/utils";

// ==================== Helpers ====================

const PAGE_SIZE = 20;

const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.8,
  MEDIUM: 0.5,
} as const;

const getConfidenceLabel = (confidence: number): string =>
  confidence >= CONFIDENCE_THRESHOLDS.HIGH
    ? "High"
    : confidence >= CONFIDENCE_THRESHOLDS.MEDIUM
      ? "Medium"
      : "Low";

const getConfidenceStyle = (confidence: number): string =>
  confidence >= CONFIDENCE_THRESHOLDS.HIGH
    ? "bg-green-100 text-green-700 border-green-200"
    : confidence >= CONFIDENCE_THRESHOLDS.MEDIUM
      ? "bg-amber-100 text-amber-700 border-amber-200"
      : "bg-red-100 text-red-700 border-red-200";

const formatTimestamp = (timestamp: string): string =>
  new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const truncateText = (text: string, maxLength: number): string =>
  text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;

const extractRepoFromKey = (key: string | null): string => {
  if (!key) {
    return "--";
  }
  const colonIndex = key.indexOf(":");
  return colonIndex > 0 ? key.slice(0, colonIndex) : key;
};

// ==================== Sub-components ====================

const TableSkeleton = () => (
  <div className="space-y-3 p-4">
    {Array.from({ length: 5 }, (_, idx) => (
      <Skeleton key={idx} className="h-12 w-full" />
    ))}
  </div>
);

interface AnalysisRowProps {
  readonly analysis: AnalysisRecord;
}

const AnalysisRow = ({ analysis }: AnalysisRowProps) => {
  const repo = extractRepoFromKey(analysis.aggregationKey);
  const confidence = Math.round(analysis.diagnosisConfidence * 100);

  return (
    <TableRow>
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
    </TableRow>
  );
};

// ==================== Main Component ====================

export const CICDAnalyses = () => {
  const [offset, setOffset] = useState(0);
  const { data, isLoading, error } = useAnalyses(PAGE_SIZE, offset);

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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((analysis) => (
                    <AnalysisRow key={analysis.id} analysis={analysis} />
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
