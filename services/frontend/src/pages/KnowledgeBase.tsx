/**
 * Knowledge Base Page
 *
 * Displays RAG knowledge base stats and a filterable, paginated table
 * of knowledge documents for the current tenant.
 */

import { useState, useMemo, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
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
import { Badge } from "@/components/ui/badge";
import { BookOpen, RefreshCw, Database, FileText, ExternalLink } from "lucide-react";
import { formatTimestamp, titleCase, truncateText } from "@/lib/formatters";
import { isSafeUrl } from "@/lib/urlSafety";
import {
  useKnowledgeBaseStats,
  useKnowledgeDocuments,
  type KnowledgeDocDTO,
} from "@/hooks/useKnowledgeBase";
import { TableSkeleton } from "@/components/TableSkeleton";
import { PaginationControls } from "@/components/PaginationControls";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileDataCard } from "@/components/MobileDataCard";

// ==================== Constants ====================

const PAGINATION_CONFIG = {
  DEFAULT_PAGE_SIZE: 20,
} as const;

const ALL_TYPES_VALUE = "__all__";

// ==================== Helpers ====================

/** Formats a snake_case doc type into a display label. */
const formatDocType = (docType: string): string =>
  docType
    .split("_")
    .map((word) => titleCase(word))
    .join(" ");

// ==================== Sub-components ====================

interface StatsHeaderProps {
  readonly totalDocuments: number;
  readonly documentsByType: Record<string, number>;
}

const StatsHeader = ({ totalDocuments, documentsByType }: StatsHeaderProps) => {
  const topTypes = useMemo(() => {
    const entries = Object.entries(documentsByType);
    return entries.sort(([, countA], [, countB]) => countB - countA).slice(0, 6);
  }, [documentsByType]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950 rounded-lg border border-indigo-200 dark:border-indigo-800">
        <Database className="w-4 h-4 text-indigo-500" />
        <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
          {totalDocuments} document{totalDocuments !== 1 ? "s" : ""}
        </span>
      </div>
      {topTypes.map(([docType, count]) => (
        <Badge key={docType} variant="outline" className="text-xs text-zinc-600 dark:text-zinc-400">
          {formatDocType(docType)}: {count}
        </Badge>
      ))}
    </div>
  );
};

interface DocTableRowProps {
  readonly doc: KnowledgeDocDTO;
}

const DocTableRow = ({ doc }: DocTableRowProps) => (
  <TableRow>
    <TableCell className="max-w-[300px]">
      <div className="flex items-center gap-2">
        <span className="text-sm text-zinc-900 dark:text-zinc-100" title={doc.title}>
          {truncateText(doc.title, 60)}
        </span>
        {/* SECURITY (VULN-703): Validate URL protocol before rendering as link */}
        {doc.sourceUrl && isSafeUrl(doc.sourceUrl) && (
          <a
            href={doc.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 hover:text-indigo-500 transition-colors flex-shrink-0"
            onClick={(event) => event.stopPropagation()}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </TableCell>
    <TableCell>
      <Badge variant="secondary" className="text-xs">
        {formatDocType(doc.docType)}
      </Badge>
    </TableCell>
    <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">
      {doc.repository ?? "--"}
    </TableCell>
    <TableCell className="text-sm text-zinc-500 dark:text-zinc-400 max-w-[200px]">
      <span title={doc.content}>{truncateText(doc.content, 50)}</span>
    </TableCell>
    <TableCell className="text-sm text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
      {formatTimestamp(doc.createdAt)}
    </TableCell>
  </TableRow>
);

// ==================== Main Component ====================

export const KnowledgeBase = () => {
  const isMobile = useIsMobile();
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(PAGINATION_CONFIG.DEFAULT_PAGE_SIZE);
  const [selectedDocType, setSelectedDocType] = useState<string>(ALL_TYPES_VALUE);

  const docTypeFilter = selectedDocType === ALL_TYPES_VALUE ? undefined : selectedDocType;

  const { data: stats, isLoading: statsLoading } = useKnowledgeBaseStats();
  const {
    data: docsData,
    isLoading: docsLoading,
    error: docsError,
    refetch,
  } = useKnowledgeDocuments(pageSize, offset, docTypeFilter);

  const items = useMemo(() => docsData?.items ?? [], [docsData?.items]);
  const total = docsData?.total ?? 0;

  const hasItems = items.length > 0;
  const currentPage = Math.floor(offset / pageSize) + 1;
  const totalPages = Math.ceil(total / pageSize);
  const hasPrev = offset > 0;
  const hasNext = offset + pageSize < total;

  const docTypeOptions = useMemo(() => {
    if (!stats?.documentsByType) {
      return [];
    }
    return Object.entries(stats.documentsByType)
      .sort(([, countA], [, countB]) => countB - countA)
      .map(([docType]) => docType);
  }, [stats?.documentsByType]);

  const handleDocTypeChange = useCallback((value: string) => {
    setSelectedDocType(value);
    setOffset(0);
  }, []);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setOffset(0);
  }, []);

  const goNext = useCallback(() => {
    setOffset((prev) => prev + pageSize);
  }, [pageSize]);

  const goPrev = useCallback(() => {
    setOffset((prev) => Math.max(0, prev - pageSize));
  }, [pageSize]);

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
      {!statsLoading && stats && (
        <StatsHeader
          totalDocuments={stats.totalDocuments}
          documentsByType={stats.documentsByType}
        />
      )}

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={selectedDocType} onValueChange={handleDocTypeChange}>
          <SelectTrigger className="w-[200px]" size="sm">
            <SelectValue placeholder="All document types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TYPES_VALUE}>All document types</SelectItem>
            {docTypeOptions.map((docType) => (
              <SelectItem key={docType} value={docType}>
                {formatDocType(docType)}
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
              ? `${total} document${total > 1 ? "s" : ""}${docTypeFilter ? ` of type "${formatDocType(docTypeFilter)}"` : ""}`
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
                {truncateText(typeof docsError === "string" ? docsError : "An error occurred", 200)}
              </p>
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
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800 p-3 space-y-3">
                {items.map((doc) => (
                  <MobileDataCard
                    key={doc.id}
                    title={truncateText(doc.title, 60)}
                    subtitle={doc.repository ?? undefined}
                    timestamp={doc.createdAt}
                    badges={[
                      {
                        label: formatDocType(doc.docType),
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
                      doc.sourceUrl && isSafeUrl(doc.sourceUrl)
                        ? () => window.open(doc.sourceUrl as string, "_blank", "noopener")
                        : undefined
                    }
                  />
                ))}
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
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableCaption className="sr-only">
                    Knowledge base documents table showing title, type, repository, preview, and
                    created date
                  </TableCaption>
                  <TableHeader className="bg-zinc-50/80 dark:bg-zinc-800/50">
                    <tr>
                      <TableHead scope="col">Title</TableHead>
                      <TableHead scope="col">Type</TableHead>
                      <TableHead scope="col">Repository</TableHead>
                      <TableHead scope="col">Preview</TableHead>
                      <TableHead scope="col">Created</TableHead>
                    </tr>
                  </TableHeader>
                  <TableBody>
                    {items.map((doc) => (
                      <DocTableRow key={doc.id} doc={doc} />
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
