/**
 * Knowledge Base Hooks
 *
 * TanStack Query hooks for fetching RAG knowledge base stats
 * and paginated document listings.
 */

import { useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { fetchQuery, fetchMutation, fetchMutationVoid } from "@/lib/fetchQuery";
import { queryKeys } from "@/lib/queryKeys";
import { useToFetchResult, type UseFetchResult, type MutationState } from "@/hooks/useQueryCompat";
import type {
  KnowledgeBaseStats,
  KnowledgeDocListResponse,
  AddDocumentInput,
  AddDocumentResponse,
} from "./types";
import { buildKnowledgeDocsUrl } from "./urlBuilders";

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
