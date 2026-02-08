/**
 * RAG Vector Search Module
 *
 * Provides semantic search over diff chunks and knowledge documents
 * using pgvector with embedding caching for efficiency.
 *
 * @module rag/search
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import type { RequestContext } from "../core/types.js";
import {
  searchSimilarDiffChunks,
  searchSimilarKnowledgeDocs,
  type DiffChunk,
  type VectorSearchResult,
  type VectorSearchFilters,
} from "../database/index.js";
import type { KnowledgeDocRecord } from "../database/knowledgeDoc/types.js";
import type {
  SearchQuery,
  DiffSearchQuery,
  KnowledgeSearchQuery,
  RAGSearchResult,
  QueryContext,
} from "./types.js";
import { VECTOR_SIMILARITY_THRESHOLDS } from "../constants/index.js";
import { estimateTokenCount } from "./chunking.js";
import { fullRerank } from "./reranker.js";
import {
  validateQuery,
  normalizeQueryText,
  getQueryEmbedding,
  recordQueryCostSafely,
  trackKnowledgeDocHitsSafely,
  toRerankableResult,
  fromRerankedResult,
  buildQueryFromContext,
  SEARCH_CONSTANTS,
  type EventQueryContext,
} from "./searchHelpers.js";
import { cacheDeletePattern } from "../cache/cacheClient.js";
import { clearCacheForTenant } from "./costControls.js";

// Re-export types for external use
export type {
  SearchQuery,
  DiffSearchQuery,
  KnowledgeSearchQuery,
  RAGSearchResult,
} from "./types.js";
export type { EventQueryContext } from "./searchHelpers.js";

const logger = createLogger("rag-search");

// ==================== Public API ====================

/**
 * Searches for similar diff chunks using semantic similarity.
 *
 * @param query - Search query with filters
 * @returns Array of diff chunks with similarity scores
 */
export const searchDiffChunks = async (
  query: DiffSearchQuery
): Promise<{ results: ReadonlyArray<VectorSearchResult<DiffChunk>>; cacheHit: boolean }> => {
  const normalizedQuery = normalizeQueryText(query.queryText);

  if (!validateQuery(normalizedQuery)) {
    logger.warn("Query too short for diff chunk search", {
      originalLength: query.queryText.length,
      normalizedLength: normalizedQuery.length,
    });
    return { results: [], cacheHit: false };
  }

  logger.info("Searching diff chunks", {
    queryLength: normalizedQuery.length,
    tenantId: query.tenantId,
    repository: query.repository,
    topK: query.topK,
  });

  try {
    const { embedding, cacheHit } = await getQueryEmbedding(normalizedQuery, query.tenantId);

    const filters: VectorSearchFilters = {
      tenantId: query.tenantId,
      repository: query.repository,
      prNumber: query.prNumber,
      filePath: query.filePath,
      minSimilarity: query.minSimilarity ?? VECTOR_SIMILARITY_THRESHOLDS.DIFF_CHUNKS,
      limit: query.topK ?? VECTOR_SIMILARITY_THRESHOLDS.DEFAULT_TOP_K,
    };

    const results = await searchSimilarDiffChunks(embedding, filters);

    // Record query cost for tenant if not a cache hit (fire-and-forget)
    if (query.tenantId && !cacheHit) {
      const tokenCount = estimateTokenCount(normalizedQuery);
      void recordQueryCostSafely(query.tenantId, tokenCount);
    }

    logger.info("Diff chunk search complete", {
      resultCount: results.length,
      cacheHit,
    });

    return { results, cacheHit };
  } catch (error) {
    logger.error("Diff chunk search failed", { error: getErrorMessage(error) });
    throw error;
  }
};

/**
 * Searches for similar knowledge documents using semantic similarity.
 * Optionally applies deterministic reranking for improved relevance.
 *
 * @param query - Search query with filters
 * @returns Array of knowledge documents with similarity scores
 */
export const searchKnowledgeDocs = async (
  query: KnowledgeSearchQuery
): Promise<{
  results: ReadonlyArray<VectorSearchResult<KnowledgeDocRecord>>;
  cacheHit: boolean;
}> => {
  const normalizedQuery = normalizeQueryText(query.queryText);

  if (!validateQuery(normalizedQuery)) {
    logger.warn("Query too short for knowledge doc search", {
      originalLength: query.queryText.length,
      normalizedLength: normalizedQuery.length,
    });
    return { results: [], cacheHit: false };
  }

  const enableReranking = query.enableReranking ?? true; // Default to enabled

  logger.info("Searching knowledge documents", {
    queryLength: normalizedQuery.length,
    tenantId: query.tenantId,
    docType: query.docType,
    topK: query.topK,
    enableReranking,
  });

  try {
    const { embedding, cacheHit } = await getQueryEmbedding(normalizedQuery, query.tenantId);

    // Fetch more results when reranking to allow for reordering
    const fetchLimit = enableReranking
      ? (query.topK ?? VECTOR_SIMILARITY_THRESHOLDS.DEFAULT_TOP_K) * 2
      : (query.topK ?? VECTOR_SIMILARITY_THRESHOLDS.DEFAULT_TOP_K);

    const filters: VectorSearchFilters = {
      tenantId: query.tenantId,
      docType: query.docType as VectorSearchFilters["docType"],
      minSimilarity: query.minSimilarity ?? VECTOR_SIMILARITY_THRESHOLDS.KNOWLEDGE_DOCS,
      limit: fetchLimit,
    };

    const rawResults = await searchSimilarKnowledgeDocs(embedding, filters);

    // Apply reranking if enabled
    let finalResults: ReadonlyArray<VectorSearchResult<KnowledgeDocRecord>>;

    if (enableReranking && rawResults.length > 0) {
      const queryContext: QueryContext = {
        repository: query.repository,
        workflow: query.workflow,
        errorSignature: query.errorSignature,
      };

      const rerankableResults = rawResults.map(toRerankableResult);
      const reranked = fullRerank(rerankableResults, {
        queryContext,
        topK: query.topK ?? VECTOR_SIMILARITY_THRESHOLDS.DEFAULT_TOP_K,
      });

      finalResults = reranked.map((rerankedResult) =>
        fromRerankedResult(rerankedResult, rawResults)
      );

      logger.debug("Reranking applied to knowledge docs", {
        originalCount: rawResults.length,
        rerankedCount: finalResults.length,
        topScore: reranked[0]?.finalScore ?? 0,
      });
    } else {
      finalResults = rawResults.slice(0, query.topK ?? VECTOR_SIMILARITY_THRESHOLDS.DEFAULT_TOP_K);
    }

    // Record query cost for tenant if not a cache hit (fire-and-forget)
    if (query.tenantId && !cacheHit) {
      const tokenCount = estimateTokenCount(normalizedQuery);
      void recordQueryCostSafely(query.tenantId, tokenCount);
    }

    // Track hit counts for retrieved documents (fire-and-forget)
    const docIds = finalResults.map((result) => result.item.id);
    void trackKnowledgeDocHitsSafely(docIds);

    logger.info("Knowledge doc search complete", {
      resultCount: finalResults.length,
      cacheHit,
      reranked: enableReranking,
    });

    return { results: finalResults, cacheHit };
  } catch (error) {
    logger.error("Knowledge doc search failed", { error: getErrorMessage(error) });
    throw error;
  }
};

/**
 * Performs a combined search across diff chunks and knowledge documents.
 * Useful for finding all relevant context for an event.
 * Applies reranking to knowledge docs by default for improved relevance.
 *
 * @param query - Search query with filters
 * @returns Combined search results from both sources
 */
export const searchAll = async (query: SearchQuery): Promise<RAGSearchResult> => {
  const normalizedQuery = normalizeQueryText(query.queryText);
  const queryTokens = estimateTokenCount(normalizedQuery);

  if (!validateQuery(normalizedQuery)) {
    logger.warn("Query too short for combined search", {
      originalLength: query.queryText.length,
      normalizedLength: normalizedQuery.length,
    });
    return {
      diffChunks: [],
      knowledgeDocs: [],
      queryTokens,
      cacheHit: false,
    };
  }

  const enableReranking = query.enableReranking ?? true;
  const topK = query.topK ?? VECTOR_SIMILARITY_THRESHOLDS.DEFAULT_TOP_K;

  logger.info("Performing combined RAG search", {
    queryLength: normalizedQuery.length,
    queryTokens,
    tenantId: query.tenantId,
    repository: query.repository,
    enableReranking,
  });

  try {
    // Get embedding (shared between both searches)
    const { embedding, cacheHit } = await getQueryEmbedding(normalizedQuery, query.tenantId);

    // Fetch more knowledge docs when reranking to allow for reordering
    const knowledgeLimit = enableReranking ? topK * 2 : topK;

    // Run both searches in parallel
    const [diffResults, rawKnowledgeResults] = await Promise.all([
      searchSimilarDiffChunks(embedding, {
        tenantId: query.tenantId,
        repository: query.repository,
        minSimilarity: query.minSimilarity ?? VECTOR_SIMILARITY_THRESHOLDS.DIFF_CHUNKS,
        limit: topK,
      }),
      searchSimilarKnowledgeDocs(embedding, {
        tenantId: query.tenantId,
        minSimilarity: query.minSimilarity ?? VECTOR_SIMILARITY_THRESHOLDS.KNOWLEDGE_DOCS,
        limit: knowledgeLimit,
      }),
    ]);

    // Apply reranking to knowledge docs if enabled
    let knowledgeResults: ReadonlyArray<VectorSearchResult<KnowledgeDocRecord>>;

    if (enableReranking && rawKnowledgeResults.length > 0) {
      const queryContext: QueryContext = {
        repository: query.repository,
        workflow: query.workflow,
        errorSignature: query.errorSignature,
      };

      const rerankableResults = rawKnowledgeResults.map(toRerankableResult);
      const reranked = fullRerank(rerankableResults, {
        queryContext,
        topK,
      });

      knowledgeResults = reranked.map((rerankedResult) =>
        fromRerankedResult(rerankedResult, rawKnowledgeResults)
      );

      logger.debug("Reranking applied in combined search", {
        originalCount: rawKnowledgeResults.length,
        rerankedCount: knowledgeResults.length,
      });
    } else {
      knowledgeResults = rawKnowledgeResults.slice(0, topK);
    }

    // Track hit counts for retrieved knowledge documents (fire-and-forget)
    const docIds = knowledgeResults.map((result) => result.item.id);
    void trackKnowledgeDocHitsSafely(docIds);

    logger.info("Combined RAG search complete", {
      diffChunkCount: diffResults.length,
      knowledgeDocCount: knowledgeResults.length,
      cacheHit,
      reranked: enableReranking,
    });

    return {
      diffChunks: diffResults,
      knowledgeDocs: knowledgeResults,
      queryTokens,
      cacheHit,
    };
  } catch (error) {
    logger.error("Combined RAG search failed", { error: getErrorMessage(error) });
    throw error;
  }
};

/**
 * Builds a search query from event context and searches all sources.
 * Convenience function for the common case of searching based on CI failure events.
 *
 * @param eventContext - Event context for query construction
 * @param tenantId - Optional tenant ID for filtering
 * @param requestContext - Optional request context for tracing
 * @returns Combined search results
 */
export const searchFromEventContext = async (
  eventContext: EventQueryContext,
  tenantId?: string,
  requestContext?: RequestContext
): Promise<RAGSearchResult> => {
  const queryText = buildQueryFromContext(eventContext);

  logger.info("Building search from event context", {
    eventType: eventContext.eventType,
    repository: eventContext.repository,
    queryLength: queryText.length,
    ...(requestContext ?? {}),
  });

  return searchAll({
    queryText,
    tenantId,
    repository: eventContext.repository,
  });
};

/**
 * Clears cached embeddings for a tenant.
 * Clears both Redis cache and in-memory cache.
 *
 * @param tenantId - Tenant ID to clear cache for
 * @returns Object with counts of cleared entries from each cache
 */
export const clearEmbeddingCache = async (
  tenantId: string
): Promise<{ redisCleared: number; memoryCleared: number }> => {
  logger.info("Clearing embedding cache for tenant", { tenantId });

  // Clear Redis cache using pattern matching
  const pattern = `${SEARCH_CONSTANTS.CACHE_KEY_PREFIX}${tenantId}:*`;
  const redisCleared = await cacheDeletePattern(pattern);

  // Clear in-memory cache
  const memoryCleared = clearCacheForTenant(tenantId);

  logger.info("Embedding cache cleared", { tenantId, redisCleared, memoryCleared });
  return { redisCleared, memoryCleared };
};
