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
import { redactSecrets } from "../security/index.js";
import { cacheGet, cacheSet } from "../cache/cacheClient.js";
import { EmbeddingClient } from "../openaiClient/embedding.js";
import {
  searchSimilarDiffChunks,
  searchSimilarKnowledgeDocs,
  type DiffChunk,
  type VectorSearchResult,
  type VectorSearchFilters,
} from "../database/index.js";
import { type KnowledgeDocRecord } from "../database/vectorTypes.js";
import { VECTOR_SIMILARITY_THRESHOLDS } from "../constants/index.js";
import { recordEmbeddingOperation } from "./metrics.js";
import { estimateTokenCount } from "./chunking.js";

const logger = createLogger("rag-search");

// ==================== Types ====================

/**
 * Search query input with optional filters.
 */
export interface SearchQuery {
  readonly queryText: string;
  readonly tenantId?: string;
  readonly repository?: string;
  readonly topK?: number;
  readonly minSimilarity?: number;
}

/**
 * Search query for diff chunks with PR-specific filters.
 */
export interface DiffSearchQuery extends SearchQuery {
  readonly prNumber?: number;
  readonly filePath?: string;
}

/**
 * Search query for knowledge docs with doc-type filters.
 */
export interface KnowledgeSearchQuery extends SearchQuery {
  readonly docType?: string;
}

/**
 * Combined search result with source type.
 */
export interface RAGSearchResult {
  readonly diffChunks: ReadonlyArray<VectorSearchResult<DiffChunk>>;
  readonly knowledgeDocs: ReadonlyArray<VectorSearchResult<KnowledgeDocRecord>>;
  readonly queryTokens: number;
  readonly cacheHit: boolean;
}

/**
 * Query construction input from event context.
 */
export interface EventQueryContext {
  readonly eventType: string;
  readonly repository: string;
  readonly errorMessage?: string;
  readonly failureSummary?: string;
  readonly affectedFiles?: readonly string[];
  readonly testNames?: readonly string[];
}

// ==================== Constants ====================

const SEARCH_CONSTANTS = {
  /** Maximum query tokens before truncation */
  MAX_QUERY_TOKENS: 2000,
  /** Cache TTL for query embeddings in seconds (1 hour) */
  EMBEDDING_CACHE_TTL_SECONDS: 3600,
  /** Minimum query length to process */
  MIN_QUERY_LENGTH: 10,
  /** Cache key prefix for query embeddings */
  CACHE_KEY_PREFIX: "rag:embedding:",
} as const;

// ==================== Helper Functions ====================

/**
 * Generates a cache key for a query embedding.
 */
const buildEmbeddingCacheKey = (queryText: string, tenantId?: string): string => {
  const hash = simpleHash(queryText);
  const tenantPart = tenantId ?? "global";
  return `${SEARCH_CONSTANTS.CACHE_KEY_PREFIX}${tenantPart}:${hash}`;
};

/**
 * Simple string hash for cache keys.
 * Uses djb2 algorithm for fast, reasonably distributed hashing.
 */
const simpleHash = (text: string): string => {
  const DJB2_INITIAL = 5381;
  const DJB2_MULTIPLIER = 33;

  const hashValue = text.split("").reduce(
    // eslint-disable-next-line no-bitwise -- DJB2 hash algorithm requires bitwise XOR and unsigned right shift
    (hash, char) => ((hash * DJB2_MULTIPLIER) ^ char.charCodeAt(0)) >>> 0,
    DJB2_INITIAL
  );

  return hashValue.toString(16);
};

/**
 * Normalizes query text by redacting secrets and truncating.
 */
const normalizeQueryText = (text: string): string => {
  // Redact secrets first
  const redacted = redactSecrets(text);

  // Estimate tokens
  const tokens = estimateTokenCount(redacted);

  // Truncate if too long (rough character estimate)
  if (tokens > SEARCH_CONSTANTS.MAX_QUERY_TOKENS) {
    const charsPerToken = 4;
    const maxChars = SEARCH_CONSTANTS.MAX_QUERY_TOKENS * charsPerToken;
    return redacted.substring(0, maxChars);
  }

  return redacted;
};

/**
 * Builds a search query from event context.
 */
const buildQueryFromContext = (context: EventQueryContext): string => {
  const parts: string[] = [];

  // Add event type context
  parts.push(`Event: ${context.eventType}`);
  parts.push(`Repository: ${context.repository}`);

  // Add error/failure information
  if (context.errorMessage) {
    parts.push(`Error: ${context.errorMessage}`);
  }

  if (context.failureSummary) {
    parts.push(`Summary: ${context.failureSummary}`);
  }

  // Add affected files
  if (context.affectedFiles && context.affectedFiles.length > 0) {
    const fileList = context.affectedFiles.slice(0, 10).join(", ");
    parts.push(`Files: ${fileList}`);
  }

  // Add test names
  if (context.testNames && context.testNames.length > 0) {
    const testList = context.testNames.slice(0, 5).join(", ");
    parts.push(`Tests: ${testList}`);
  }

  return parts.join("\n");
};

/**
 * Validates search query input.
 */
const validateQuery = (queryText: string): boolean =>
  queryText.trim().length >= SEARCH_CONSTANTS.MIN_QUERY_LENGTH;

// ==================== Embedding Functions ====================

/**
 * Gets or generates embedding for a query, using cache when available.
 */
const getQueryEmbedding = async (
  queryText: string,
  tenantId?: string
): Promise<{ embedding: readonly number[]; cacheHit: boolean }> => {
  const cacheKey = buildEmbeddingCacheKey(queryText, tenantId);

  // Try cache first
  const cached = await cacheGet<readonly number[]>(cacheKey);
  if (cached.hit && cached.data) {
    logger.debug("Query embedding cache hit", { cacheKey });
    return { embedding: cached.data, cacheHit: true };
  }

  // Generate new embedding
  const startTime = Date.now();
  const embeddingClient = new EmbeddingClient();

  try {
    const result = await embeddingClient.generateEmbedding(queryText);
    const latencyMs = Date.now() - startTime;

    // Record metrics
    recordEmbeddingOperation(result.tokenCount, latencyMs, true);

    // Cache the embedding
    await cacheSet(cacheKey, result.embedding, {
      ttlSeconds: SEARCH_CONSTANTS.EMBEDDING_CACHE_TTL_SECONDS,
    });

    logger.debug("Generated and cached query embedding", {
      cacheKey,
      tokens: result.tokenCount,
      latencyMs,
    });

    return { embedding: result.embedding, cacheHit: false };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    recordEmbeddingOperation(0, latencyMs, false);
    throw error;
  }
};

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

  logger.info("Searching knowledge documents", {
    queryLength: normalizedQuery.length,
    tenantId: query.tenantId,
    docType: query.docType,
    topK: query.topK,
  });

  try {
    const { embedding, cacheHit } = await getQueryEmbedding(normalizedQuery, query.tenantId);

    const filters: VectorSearchFilters = {
      tenantId: query.tenantId,
      docType: query.docType as VectorSearchFilters["docType"],
      minSimilarity: query.minSimilarity ?? VECTOR_SIMILARITY_THRESHOLDS.KNOWLEDGE_DOCS,
      limit: query.topK ?? VECTOR_SIMILARITY_THRESHOLDS.DEFAULT_TOP_K,
    };

    const results = await searchSimilarKnowledgeDocs(embedding, filters);

    logger.info("Knowledge doc search complete", {
      resultCount: results.length,
      cacheHit,
    });

    return { results, cacheHit };
  } catch (error) {
    logger.error("Knowledge doc search failed", { error: getErrorMessage(error) });
    throw error;
  }
};

/**
 * Performs a combined search across diff chunks and knowledge documents.
 * Useful for finding all relevant context for an event.
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

  logger.info("Performing combined RAG search", {
    queryLength: normalizedQuery.length,
    queryTokens,
    tenantId: query.tenantId,
    repository: query.repository,
  });

  try {
    // Get embedding (shared between both searches)
    const { embedding, cacheHit } = await getQueryEmbedding(normalizedQuery, query.tenantId);

    // Run both searches in parallel
    const [diffResults, knowledgeResults] = await Promise.all([
      searchSimilarDiffChunks(embedding, {
        tenantId: query.tenantId,
        repository: query.repository,
        minSimilarity: query.minSimilarity ?? VECTOR_SIMILARITY_THRESHOLDS.DIFF_CHUNKS,
        limit: query.topK ?? VECTOR_SIMILARITY_THRESHOLDS.DEFAULT_TOP_K,
      }),
      searchSimilarKnowledgeDocs(embedding, {
        tenantId: query.tenantId,
        minSimilarity: query.minSimilarity ?? VECTOR_SIMILARITY_THRESHOLDS.KNOWLEDGE_DOCS,
        limit: query.topK ?? VECTOR_SIMILARITY_THRESHOLDS.DEFAULT_TOP_K,
      }),
    ]);

    logger.info("Combined RAG search complete", {
      diffChunkCount: diffResults.length,
      knowledgeDocCount: knowledgeResults.length,
      cacheHit,
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
 * @param context - Event context for query construction
 * @param tenantId - Optional tenant ID for filtering
 * @returns Combined search results
 */
export const searchFromEventContext = async (
  context: EventQueryContext,
  tenantId?: string
): Promise<RAGSearchResult> => {
  const queryText = buildQueryFromContext(context);

  logger.info("Building search from event context", {
    eventType: context.eventType,
    repository: context.repository,
    queryLength: queryText.length,
  });

  return searchAll({
    queryText,
    tenantId,
    repository: context.repository,
  });
};

/**
 * Clears cached embeddings for a tenant.
 * Useful when re-processing or debugging.
 *
 * @param tenantId - Tenant ID to clear cache for
 */
export const clearEmbeddingCache = async (tenantId: string): Promise<void> => {
  // Note: This would require pattern-based deletion which isn't implemented
  // in the basic cache client. For now, we just log the intent.
  logger.info("Embedding cache clear requested", { tenantId });
  // Implementation would use cacheDeletePattern when available
};
