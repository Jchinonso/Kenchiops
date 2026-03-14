/**
 * Knowledge Base Page
 *
 * Displays RAG knowledge base stats and a filterable, paginated table
 * of knowledge documents for the current tenant.
 */

import { useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableRow, TableCaption } from "@/components/ui/table";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, RefreshCw, FileText } from "lucide-react";
import { formatSnakeCase, truncateText } from "@/lib/formatters";
import { isSafeUrl } from "@/lib/urlSafety";
import { useKnowledgeBaseStats, useKnowledgeDocuments } from "@/hooks/useKnowledgeBase";
import { TableSkeleton } from "@/components/TableSkeleton";
import { PaginationControls } from "@/components/PaginationControls";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileDataCard } from "@/components/MobileDataCard";
import { usePageTitle } from "@/hooks/usePageTitle";
import { StatsHeader } from "./StatsHeader";
import { DocTableRow } from "./DocTableRow";
import { PAGINATION_CONFIG, ALL_TYPES_VALUE } from "./constants";

// ==================== Main Component ====================

export const KnowledgeBase = () => {
  const isMobile = useIsMobile();
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState<number>(PAGINATION_CONFIG.DEFAULT_PAGE_SIZE);
  const [selectedDocType, setSelectedDocType] = useState<string>(ALL_TYPES_VALUE);

  const docTypeFilter = selectedDocType === ALL_TYPES_VALUE ? undefined : selectedDocType;

  const { data: stats, isLoading: statsLoading } = useKnowledgeBaseStats();
  const {
    data: docsData,
    isLoading: docsLoading,
    error: docsError,
    refetch,
  } = useKnowledgeDocuments(pageSize, offset, docTypeFilter);

  const items = docsData?.items ?? [];
  const total = docsData?.total ?? 0;

  // Reset offset when filtered results are fewer than current position (render-time state adjustment)
  const [prevTotal, setPrevTotal] = useState(total);
  if (total !== prevTotal) {
    setPrevTotal(total);
    if (total > 0 && offset >= total) {
      setOffset(0);
    }
  }

  usePageTitle("Knowledge Base | Kenchi");

  const hasItems = items.length > 0;
  const currentPage = Math.floor(offset / pageSize) + 1;
  const totalPages = Math.ceil(total / pageSize);
  const hasPrev = offset > 0;
  const hasNext = offset + pageSize < total;

  const documentsByType = stats?.documentsByType;
  const docTypeOptions = useMemo(() => {
    if (!documentsByType) {
      return [];
    }
    return [...Object.entries(documentsByType)]
      .sort(([, countA], [, countB]) => countB - countA)
      .map(([docType]) => docType);
  }, [documentsByType]);

  const handleDocTypeChange = (value: string) => {
    setSelectedDocType(value);
    setOffset(0);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setOffset(0);
  };

  const goNext = () => {
    setOffset((prev) => prev + pageSize);
  };

  const goPrev = () => {
    setOffset((prev) => Math.max(0, prev - pageSize));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-display font-bold text-zinc-900 dark:text-zinc-100">
          Knowledge Base
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Browse documents ingested into the RAG knowledge base for AI-powered analysis.
        </p>
      </div>

      {/* Stats Header */}
      {statsLoading ? (
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-8 w-40 rounded-lg" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ) : stats ? (
        <StatsHeader
          totalDocuments={stats.totalDocuments}
          documentsByType={stats.documentsByType}
        />
      ) : null}

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select
          value={selectedDocType}
          onValueChange={handleDocTypeChange}
          disabled={docTypeOptions.length === 0}
        >
          <SelectTrigger className="w-[200px]" size="sm" aria-label="Filter by document type">
            <SelectValue placeholder="All document types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TYPES_VALUE}>All document types</SelectItem>
            {docTypeOptions.map((docType) => (
              <SelectItem key={docType} value={docType}>
                {formatSnakeCase(docType)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Documents Table */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-500" />
            <CardTitle>Documents</CardTitle>
          </div>
          <CardDescription>
            {total > 0
              ? `${total} document${total > 1 ? "s" : ""}${docTypeFilter ? ` of type "${formatSnakeCase(docTypeFilter)}"` : ""}`
              : "No documents found"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {docsLoading ? (
            <TableSkeleton columns={5} />
          ) : docsError ? (
            <div className="p-8 text-center space-y-3">
              {/* SECURITY (VULN-706): Truncate error to prevent verbose info disclosure */}
              <p className="text-sm text-red-600 dark:text-red-400">
                {truncateText(docsError ?? "An error occurred", 200)}
              </p>
              <button
                type="button"
                onClick={() => {
                  refetch();
                }}
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
                  <BookOpen className="w-6 h-6" />
                </EmptyMedia>
                <EmptyTitle>
                  {docTypeFilter ? "No matching documents" : "No documents yet"}
                </EmptyTitle>
                <EmptyDescription>
                  {docTypeFilter
                    ? "Try selecting a different document type filter."
                    : "Knowledge documents will appear here as analyses are ingested into the RAG pipeline."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : isMobile ? (
            <>
              <ul
                role="list"
                aria-label="Knowledge base documents"
                className="divide-y divide-zinc-100 dark:divide-zinc-800 p-3 space-y-3"
              >
                {items.map((doc) => {
                  const safeUrl = doc.sourceUrl && isSafeUrl(doc.sourceUrl) ? doc.sourceUrl : null;
                  return (
                    <li key={doc.id}>
                      <MobileDataCard
                        title={truncateText(doc.title, 60)}
                        subtitle={doc.repository ?? undefined}
                        timestamp={doc.createdAt}
                        badges={[
                          {
                            label: formatSnakeCase(doc.docType),
                            className:
                              "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700",
                          },
                        ]}
                        fields={[
                          {
                            label: "Preview",
                            value: truncateText(doc.content, 80),
                          },
                        ]}
                        onClick={
                          safeUrl ? () => window.open(safeUrl, "_blank", "noopener") : undefined
                        }
                      />
                    </li>
                  );
                })}
              </ul>
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
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableCaption className="sr-only">
                    Knowledge base documents table showing title, type, repository, preview, and
                    created date
                  </TableCaption>
                  <TableHeader className="bg-zinc-50/80 dark:bg-zinc-800/50">
                    <TableRow>
                      <TableHead scope="col">Title</TableHead>
                      <TableHead scope="col">Type</TableHead>
                      <TableHead scope="col">Repository</TableHead>
                      <TableHead scope="col">Preview</TableHead>
                      <TableHead scope="col">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <tbody>
                    {items.map((doc) => (
                      <DocTableRow key={doc.id} doc={doc} />
                    ))}
                  </tbody>
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
