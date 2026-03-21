/**
 * Knowledge Base Page
 *
 * Displays RAG knowledge base stats and a filterable, paginated table
 * of knowledge documents for the current tenant.
 */

import { useState, useMemo, useEffect, useCallback } from "react";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BookOpen, RefreshCw, FileText, Plus } from "lucide-react";
import { formatSnakeCase, truncateText } from "@/lib/formatters";
import { isSafeUrl } from "@/lib/urlSafety";
import {
  useKnowledgeBaseStats,
  useKnowledgeDocuments,
  useDeleteDocument,
  useBulkDeleteDocuments,
  usePurgeAllDocuments,
  type KnowledgeDocDTO,
} from "@/hooks/useKnowledgeBase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/TableSkeleton";
import { PaginationControls } from "@/components/PaginationControls";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileDataCard } from "@/components/MobileDataCard";
import { usePageTitle } from "@/hooks/usePageTitle";
import { StatsHeader } from "./StatsHeader";
import { DocTableRow } from "./DocTableRow";
import { DocDetailDrawer } from "./DocDetailDrawer";
import { AddDocumentDialog } from "./AddDocumentDialog";
import { BulkActionBar } from "./BulkActionBar";
import { DeleteConfirmDialog, BulkDeleteConfirmDialog, PurgeConfirmDialog } from "./ConfirmDialogs";
import { PAGINATION_CONFIG, ALL_TYPES_VALUE } from "./constants";

export const KnowledgeBase = () => {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState<number>(PAGINATION_CONFIG.DEFAULT_PAGE_SIZE);
  const [selectedDocType, setSelectedDocType] = useState<string>(ALL_TYPES_VALUE);
  const [selectedDoc, setSelectedDoc] = useState<KnowledgeDocDTO | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [purgeConfirmOpen, setPurgeConfirmOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);

  const docTypeFilter = selectedDocType === ALL_TYPES_VALUE ? undefined : selectedDocType;

  const { data: stats, isLoading: statsLoading } = useKnowledgeBaseStats();
  const { deleteDocument, isDeleting } = useDeleteDocument();
  const { bulkDelete, isBulkDeleting } = useBulkDeleteDocuments();
  const { purgeAll, isPurging } = usePurgeAllDocuments(user?.tenantId ?? null);
  const {
    data: docsData,
    isLoading: docsLoading,
    error: docsError,
    refetch,
  } = useKnowledgeDocuments(pageSize, offset, docTypeFilter);

  const items = docsData?.items ?? [];
  const total = docsData?.total ?? 0;

  useEffect(() => {
    if (total > 0 && offset >= total) {
      setOffset(0);
    }
  }, [total, offset]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [offset, pageSize, selectedDocType]);

  usePageTitle("Knowledge Base | Kenchi");

  const hasItems = items.length > 0;
  const currentPage = Math.floor(offset / pageSize) + 1;
  const totalPages = Math.ceil(total / pageSize);
  const hasPrev = offset > 0;
  const hasNext = offset + pageSize < total;
  const selectionCount = selectedIds.size;
  const allOnPageSelected = hasItems && items.every((doc) => selectedIds.has(doc.id));

  const docTypeOptions = useMemo(() => {
    const documentsByType = stats?.documentsByType;
    if (!documentsByType) {
      return [];
    }
    return [...Object.entries(documentsByType)]
      .sort(([, countA], [, countB]) => countB - countA)
      .map(([docType]) => docType);
  }, [stats?.documentsByType]);

  const handleDocTypeChange = (value: string) => {
    setSelectedDocType(value);
    setOffset(0);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setOffset(0);
  };

  const goNext = () => setOffset((prev) => prev + pageSize);
  const goPrev = () => setOffset((prev) => Math.max(0, prev - pageSize));

  const handleDocClick = useCallback((doc: KnowledgeDocDTO) => {
    setSelectedDoc(doc);
    setDrawerOpen(true);
  }, []);

  const handleDrawerOpenChange = useCallback((open: boolean) => {
    setDrawerOpen(open);
    if (!open) {
      setSelectedDoc(null);
    }
  }, []);

  const handleRowDelete = useCallback((id: string) => {
    setDeleteTargetId(id);
  }, []);

  const confirmRowDelete = useCallback(async () => {
    if (!deleteTargetId) {
      return;
    }
    const success = await deleteDocument(deleteTargetId);
    if (success) {
      toast.success("Document deleted");
      setDeleteTargetId(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteTargetId);
        return next;
      });
    } else {
      toast.error("Failed to delete document");
    }
  }, [deleteTargetId, deleteDocument]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    setSelectedIds(allOnPageSelected ? new Set() : new Set(items.map((doc) => doc.id)));
  }, [allOnPageSelected, items]);

  const handleClearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) {
      return;
    }
    const idsToDelete = [...selectedIds];
    const deletedCount = await bulkDelete(idsToDelete);
    setBulkDeleteConfirmOpen(false);
    setSelectedIds(new Set());
    if (deletedCount === idsToDelete.length) {
      toast.success(`Deleted ${deletedCount} document${deletedCount > 1 ? "s" : ""}`);
    } else if (deletedCount > 0) {
      toast.warning(
        `Deleted ${deletedCount} of ${idsToDelete.length} documents. Some were not found.`
      );
    } else {
      toast.error("Failed to delete documents");
    }
  }, [selectedIds, bulkDelete]);

  const handlePurgeAll = useCallback(async () => {
    const success = await purgeAll();
    if (success) {
      toast.success("All documents purged");
      setPurgeConfirmOpen(false);
    } else {
      toast.error("Failed to purge documents");
    }
  }, [purgeAll]);

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
        <Button size="sm" onClick={() => setAddDialogOpen(true)}>
          <Plus className="w-4 h-4" />
          Add Document
        </Button>
        {total > 0 && (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setPurgeConfirmOpen(true)}
            disabled={isPurging}
          >
            {isPurging ? "Purging..." : "Purge All Documents"}
          </Button>
        )}
      </div>

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

        {selectionCount > 0 && (
          <BulkActionBar
            selectionCount={selectionCount}
            allOnPageSelected={allOnPageSelected}
            isBulkDeleting={isBulkDeleting}
            onDeleteSelected={() => setBulkDeleteConfirmOpen(true)}
            onSelectAllOnPage={handleToggleSelectAll}
            onClearSelection={handleClearSelection}
          />
        )}

        <CardContent className="p-0">
          {docsLoading ? (
            <TableSkeleton columns={7} />
          ) : docsError ? (
            <div className="p-8 text-center space-y-3">
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
                        fields={[{ label: "Preview", value: truncateText(doc.content, 80) }]}
                        onClick={
                          safeUrl
                            ? () => window.open(safeUrl, "_blank", "noopener")
                            : () => handleDocClick(doc)
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
                  <TableCaption className="sr-only">Knowledge base documents table</TableCaption>
                  <TableHeader className="bg-zinc-50/80 dark:bg-zinc-800/50">
                    <TableRow>
                      <TableHead scope="col" className="w-10 pr-0">
                        <Checkbox
                          checked={allOnPageSelected}
                          onCheckedChange={handleToggleSelectAll}
                          aria-label="Select all documents on page"
                        />
                      </TableHead>
                      <TableHead scope="col">Title</TableHead>
                      <TableHead scope="col">Type</TableHead>
                      <TableHead scope="col">Repository</TableHead>
                      <TableHead scope="col">Preview</TableHead>
                      <TableHead scope="col">Created</TableHead>
                      <TableHead scope="col" className="w-10 pl-0">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <tbody>
                    {items.map((doc) => (
                      <DocTableRow
                        key={doc.id}
                        doc={doc}
                        isSelected={selectedIds.has(doc.id)}
                        onToggleSelect={handleToggleSelect}
                        onClick={() => handleDocClick(doc)}
                        onDelete={handleRowDelete}
                        isDeleting={isDeleting}
                      />
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

      <DocDetailDrawer doc={selectedDoc} open={drawerOpen} onOpenChange={handleDrawerOpenChange} />
      <AddDocumentDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} />
      <DeleteConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTargetId(null);
          }
        }}
        onConfirm={() => {
          confirmRowDelete();
        }}
        isDeleting={isDeleting}
      />
      <BulkDeleteConfirmDialog
        open={bulkDeleteConfirmOpen}
        onOpenChange={setBulkDeleteConfirmOpen}
        onConfirm={() => {
          handleBulkDelete();
        }}
        selectionCount={selectionCount}
        isDeleting={isBulkDeleting}
      />
      <PurgeConfirmDialog
        open={purgeConfirmOpen}
        onOpenChange={setPurgeConfirmOpen}
        onConfirm={handlePurgeAll}
        totalDocuments={total}
        isPurging={isPurging}
      />
    </div>
  );
};
