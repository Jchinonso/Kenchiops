/**
 * Knowledge Base Hooks
 *
 * TanStack Query hooks for fetching RAG knowledge base stats
 * and paginated document listings.
 */

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchQuery } from "@/lib/fetchQuery";
import { queryKeys } from "@/lib/queryKeys";
import { useToFetchResult, type UseFetchResult } from "@/hooks/useQueryCompat";
import type { KnowledgeBaseStats, KnowledgeDocListResponse } from "./types";
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
