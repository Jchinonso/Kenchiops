/**
 * Knowledge Base Hooks
 *
 * TanStack Query hooks for fetching RAG knowledge base stats
 * and paginated document listings.
 */

import { useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { fetchQuery, fetchMutation, fetchMutationVoid } from "@/lib/fetchQuery";
import { API_URL as API_BASE } from "@/lib/apiClient";
import { queryKeys } from "@/lib/queryKeys";
import { useToFetchResult, type UseFetchResult, type MutationState } from "@/hooks/useQueryCompat";
import type {
  KnowledgeBaseStats,
  KnowledgeDocListResponse,
  AddDocumentInput,
  AddDocumentResponse,
} from "./types";
import { buildKnowledgeDocsUrl } from "./urlBuilders";

/** Response shape for bulk delete operation */
interface BulkDeleteResponse {
  readonly deletedCount: number;
}

// ==================== Constants ====================

/** Data considered fresh for 30 seconds (matches sidebar prefetch staleTime). */
const STALE_TIME = 30_000;

// ==================== Stats Hook ====================

/**
 * Fetches RAG knowledge base statistics (global counts + tenant stats).
 */
// RAG routes are mounted at /api/rag/ (not /api/v1/) per the API route structure.
export const useKnowledgeBaseStats = (): UseFetchResult<KnowledgeBaseStats> =>
  useToFetchResult(
    useQuery({
      queryKey: queryKeys.knowledgeBase.stats(),
      queryFn: () => fetchQuery<KnowledgeBaseStats>("/api/rag/stats"),
      staleTime: STALE_TIME,
    })
  );

// ==================== Documents Hook ====================

/**
 * Fetches a paginated list of knowledge documents for the current tenant.
 */
export const useKnowledgeDocuments = (
  limit: number,
  offset: number,
  docType?: string
): UseFetchResult<KnowledgeDocListResponse> => {
  const filters = { docType, limit, offset };
  const url = buildKnowledgeDocsUrl(limit, offset, docType);

  return useToFetchResult(
    useQuery({
      queryKey: queryKeys.knowledgeBase.documents(filters),
      queryFn: () => fetchQuery<KnowledgeDocListResponse>(url),
      staleTime: STALE_TIME,
      placeholderData: keepPreviousData,
    })
  );
};

// ==================== Full Document Content ====================

/** Fetches full concatenated content for the document detail view. */
export const useFullDocumentContent = (
  title: string | undefined,
  docType: string | undefined
): UseFetchResult<{ readonly content: string }> => {
  const url =
    title && docType
      ? `${API_BASE}/api/rag/documents/full-content?title=${encodeURIComponent(title)}&docType=${encodeURIComponent(docType)}`
      : "";

  return useToFetchResult(
    useQuery({
      queryKey: ["knowledgeBase", "fullContent", title, docType],
      queryFn: () => fetchQuery<{ readonly content: string }>(url),
      enabled: Boolean(title && docType),
      staleTime: STALE_TIME,
    })
  );
};

// ==================== Add Document Mutation ====================

/**
 * Mutation hook for ingesting a new knowledge document via POST /api/rag/ingest.
 * Invalidates both documents and stats queries on success.
 */
export const useAddDocument = (): MutationState & {
  readonly addDocument: (input: AddDocumentInput) => Promise<AddDocumentResponse | null>;
} => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (input: AddDocumentInput): Promise<AddDocumentResponse> =>
      fetchMutation<AddDocumentResponse>("/api/rag/ingest", {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledgeBase.all,
      });
    },
  });

  const addDocument = useCallback(
    async (input: AddDocumentInput): Promise<AddDocumentResponse | null> => {
      try {
        return await mutation.mutateAsync(input);
      } catch {
        return null;
      }
    },
    [mutation]
  );

  return useMemo(
    () => ({
      isLoading: mutation.isPending,
      error: mutation.error?.message ?? null,
      addDocument,
    }),
    [mutation.isPending, mutation.error, addDocument]
  );
};

// ==================== Purge All Documents Mutation ====================

/**
 * Mutation hook for purging ALL knowledge documents for the current tenant.
 * Uses DELETE /api/rag/tenant/:tenantId. Requires settings permission.
 */
export const usePurgeAllDocuments = (
  tenantId: string | null
): {
  readonly purgeAll: () => Promise<boolean>;
  readonly isPurging: boolean;
} => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => {
      if (!tenantId) {
        return Promise.reject(new Error("No tenant ID"));
      }
      return fetchMutationVoid(`/api/rag/tenant/${encodeURIComponent(tenantId)}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledgeBase.all,
      });
    },
  });

  const purgeAll = useCallback(async (): Promise<boolean> => {
    try {
      await mutation.mutateAsync();
      return true;
    } catch {
      return false;
    }
  }, [mutation]);

  return useMemo(
    () => ({
      purgeAll,
      isPurging: mutation.isPending,
    }),
    [purgeAll, mutation.isPending]
  );
};

// ==================== Delete Document Mutation ====================

/**
 * Mutation hook for deleting a single knowledge document.
 * Invalidates all knowledge base queries on success.
 */
export const useDeleteDocument = (): {
  readonly deleteDocument: (id: string) => Promise<boolean>;
  readonly isDeleting: boolean;
} => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (id: string) =>
      fetchMutationVoid(`/api/rag/doc/single/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledgeBase.all,
      });
    },
  });

  const deleteDocument = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await mutation.mutateAsync(id);
        return true;
      } catch {
        return false;
      }
    },
    [mutation]
  );

  return useMemo(
    () => ({
      deleteDocument,
      isDeleting: mutation.isPending,
    }),
    [deleteDocument, mutation.isPending]
  );
};

// ==================== Bulk Delete Documents Mutation ====================

/**
 * Mutation hook for bulk deleting knowledge documents by IDs.
 * Uses POST /api/rag/doc/bulk-delete. Invalidates all knowledge base queries on success.
 */
export const useBulkDeleteDocuments = (): {
  readonly bulkDelete: (ids: readonly string[]) => Promise<number>;
  readonly isBulkDeleting: boolean;
} => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (ids: readonly string[]): Promise<BulkDeleteResponse> =>
      fetchMutation<BulkDeleteResponse>("/api/rag/doc/bulk-delete", {
        method: "POST",
        body: { ids },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledgeBase.all,
      });
    },
  });

  const bulkDelete = useCallback(
    async (ids: readonly string[]): Promise<number> => {
      try {
        const result = await mutation.mutateAsync(ids);
        return result.deletedCount;
      } catch {
        return 0;
      }
    },
    [mutation]
  );

  return useMemo(
    () => ({
      bulkDelete,
      isBulkDeleting: mutation.isPending,
    }),
    [bulkDelete, mutation.isPending]
  );
};
