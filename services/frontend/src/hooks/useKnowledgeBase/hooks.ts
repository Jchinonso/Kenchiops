/**
 * Knowledge Base Hooks
 *
 * TanStack Query hooks for fetching RAG knowledge base stats
 * and paginated document listings.
 */

import { useQuery } from "@tanstack/react-query";
import { fetchQuery } from "@/lib/fetchQuery";
import { queryKeys } from "@/lib/queryKeys";
import { useToFetchResult, type UseFetchResult } from "@/hooks/useQueryCompat";
import type { KnowledgeBaseStats, KnowledgeDocListResponse } from "./types";

// ==================== Stats Hook ====================

/**
 * Fetches RAG knowledge base statistics (global counts + tenant stats).
 */
export const useKnowledgeBaseStats = (): UseFetchResult<KnowledgeBaseStats> =>
  useToFetchResult(
    useQuery({
      queryKey: queryKeys.knowledgeBase.stats(),
      queryFn: () => fetchQuery<KnowledgeBaseStats>("/api/rag/stats"),
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
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (docType) {
    params.set("docType", docType);
  }

  return useToFetchResult(
    useQuery({
      queryKey: queryKeys.knowledgeBase.documents(filters),
      queryFn: () =>
        fetchQuery<KnowledgeDocListResponse>(`/api/rag/documents?${params.toString()}`),
    })
  );
};
