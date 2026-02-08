/**
 * RAG Search Helper Functions
 *
 * Internal utilities for query processing, embedding caching,
 * and reranking conversions used by the search module.
 *
 * @module rag/searchHelpers
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage, NotFoundError } from "../core/errors.js";
import { redactSecrets } from "../security/index.js";
import { cacheGet, cacheSet } from "../cache/cacheClient.js";
import { getEmbeddingClient } from "../llm/providers/openai/embedding.js";
import { SEARCH_CONSTANTS, type EmbeddingTierName } from "../constants/index.js";
import {
  recordCost,
  batchIncrementKnowledgeDocHitCounts,
  type VectorSearchResult,
} from "../database/index.js";
import type { KnowledgeDocRecord } from "../database/knowledgeDoc/types.js";
import { recordEmbeddingOperation } from "./metrics.js";
import { estimateTokenCount } from "./chunking.js";
import type {
  RerankableResult,
  RerankedResult,
  EventQueryContext,
  QueryEmbeddingResult,
} from "./types.js";
import {
  selectEmbeddingTier,
  getCachedEmbedding,
  cacheEmbedding,
  recordQueryCost,
} from "./costControls.js";

export { SEARCH_CONSTANTS };
export type { EventQueryContext } from "./types.js";

const logger = createLogger("rag-search");

// ==================== Query Construction ====================

/**
 * Builds a search query from event context.
 */
export const buildQueryFromContext = (context: EventQueryContext): string => {
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

// ==================== Query Validation ====================

/**
 * Validates search query input meets minimum length requirements.
 */
export const validateQuery = (queryText: string): boolean =>
  queryText.trim().length >= SEARCH_CONSTANTS.MIN_QUERY_LENGTH;

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
 * Generates a cache key for a query embedding.
 */
export const buildEmbeddingCacheKey = (queryText: string, tenantId?: string): string => {
  const hash = simpleHash(queryText);
  const tenantPart = tenantId ?? "global";
  return `${SEARCH_CONSTANTS.CACHE_KEY_PREFIX}${tenantPart}:${hash}`;
};

/**
 * Normalizes query text by redacting secrets and truncating.
 */
export const normalizeQueryText = (text: string): string => {
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

// ==================== Cost & Hit Tracking ====================

/**
 * Records query cost safely without blocking the main operation.
 * Errors are logged but don't affect the caller.
 */
export const recordQueryCostSafely = async (
  tenantId: string,
  tokenCount: number
): Promise<void> => {
  try {
    await recordCost({
      tenantId,
      operationType: "query",
      embeddingTier: "STANDARD",
      tokenCount,
    });
  } catch (error) {
    logger.warn("Failed to record query cost", { error: getErrorMessage(error) });
  }
};

/**
 * Tracks hit counts for retrieved knowledge documents safely (fire-and-forget).
 * Increments hit count in metadata for analytics and reranking.
 */
export const trackKnowledgeDocHitsSafely = async (docIds: readonly string[]): Promise<void> => {
  if (docIds.length === 0) {
    return;
  }

  try {
    const updatedCount = await batchIncrementKnowledgeDocHitCounts(docIds);
    logger.debug("Tracked knowledge doc hits", {
      requestedCount: docIds.length,
      updatedCount,
    });
  } catch (error) {
    logger.warn("Failed to track knowledge doc hits", {
      error: getErrorMessage(error),
      docCount: docIds.length,
    });
  }
};

// ==================== Embedding Functions ====================

/**
 * Gets or generates embedding for a query, using cache when available.
 * When tenantId is provided, uses budget-aware tier selection.
 * Falls back to STANDARD tier for anonymous queries.
 */
export const getQueryEmbedding = async (
  queryText: string,
  tenantId?: string
): Promise<QueryEmbeddingResult> => {
  // Try cost control cache first (when tenantId provided)
  if (tenantId) {
    const costControlCached = getCachedEmbedding(queryText, tenantId);
    if (costControlCached) {
      logger.debug("Query embedding from cost control cache", { tenantId });
      return {
        embedding: costControlCached.embedding,
        cacheHit: true,
        tier: costControlCached.tier,
        dimension: costControlCached.embedding.length,
      };
    }
  }

  // Try Redis cache as fallback
  const cacheKey = buildEmbeddingCacheKey(queryText, tenantId);
  const cached = await cacheGet<{ embedding: readonly number[]; tier: EmbeddingTierName }>(
    cacheKey
  );
  if (cached.hit && cached.data) {
    logger.debug("Query embedding from Redis cache", { cacheKey });
    return {
      embedding: cached.data.embedding,
      cacheHit: true,
      tier: cached.data.tier,
      dimension: cached.data.embedding.length,
    };
  }

  // Select tier based on budget (or default to STANDARD for anonymous)
  const estimatedTokens = estimateTokenCount(queryText);
  let selectedTier: EmbeddingTierName = "STANDARD";
  let tierReason = "default tier (no tenant)";

  if (tenantId) {
    const tierSelection = await selectEmbeddingTier(tenantId, estimatedTokens);
    selectedTier = tierSelection.selectedTier;
    tierReason = tierSelection.reason;

    logger.debug("Tier selected for query embedding", {
      tenantId,
      tier: selectedTier,
      reason: tierReason,
      budgetStatus: tierSelection.budgetStatus.status,
    });
  }

  // Generate new embedding with selected tier
  const startTime = Date.now();
  const embeddingClient = getEmbeddingClient(selectedTier);

  try {
    const result = await embeddingClient.generateEmbedding(queryText);
    const latencyMs = Date.now() - startTime;
    // Cast tier since OpenAI returns EmbeddingTierName
    const tier = result.tier as EmbeddingTierName;

    // Record metrics
    recordEmbeddingOperation(result.tokenCount, latencyMs, true);

    // Cache in both places for efficiency
    const cacheData = { embedding: result.embedding, tier };
    await cacheSet(cacheKey, cacheData, {
      ttlSeconds: SEARCH_CONSTANTS.EMBEDDING_CACHE_TTL_SECONDS,
    });

    // Also cache in cost control cache (in-memory, faster)
    if (tenantId) {
      cacheEmbedding(queryText, result.embedding, tier, tenantId);

      // Record query cost for the tenant (fire-and-forget)
      void (async () => {
        try {
          await recordQueryCost(tenantId, tier, result.tokenCount);
        } catch (costError) {
          logger.warn("Failed to record query cost", { error: getErrorMessage(costError) });
        }
      })();
    }

    logger.debug("Generated and cached query embedding", {
      cacheKey,
      tier,
      dimension: result.dimension,
      tokens: result.tokenCount,
      latencyMs,
    });

    return {
      embedding: result.embedding,
      cacheHit: false,
      tier,
      dimension: result.dimension,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    recordEmbeddingOperation(0, latencyMs, false);
    throw error;
  }
};

// ==================== Reranking Conversions ====================

/**
 * Converts a knowledge doc search result to a rerankable format.
 */
export const toRerankableResult = (
  result: VectorSearchResult<KnowledgeDocRecord>
): RerankableResult => ({
  id: result.item.id,
  similarity: result.similarity,
  docType: result.item.docType,
  content: result.item.content,
  createdAt: result.item.createdAt.toISOString(),
  metadata: {
    repository: result.item.repository ?? undefined,
    workflow: (result.item.metadata as Record<string, unknown>)?.workflow as string | undefined,
    errorSignature: (result.item.metadata as Record<string, unknown>)?.errorSignature as
      | string
      | undefined,
    language: (result.item.metadata as Record<string, unknown>)?.language as string | undefined,
    hitCount: (result.item.metadata as Record<string, unknown>)?.hitCount as number | undefined,
    helpfulRate: (result.item.metadata as Record<string, unknown>)?.helpfulRate as
      | number
      | undefined,
    negativeFeedbackCount: (result.item.metadata as Record<string, unknown>)
      ?.negativeFeedbackCount as number | undefined,
  },
});

/**
 * Converts reranked results back to VectorSearchResult format.
 */
export const fromRerankedResult = (
  reranked: RerankedResult,
  originalResults: ReadonlyArray<VectorSearchResult<KnowledgeDocRecord>>
): VectorSearchResult<KnowledgeDocRecord> => {
  const original = originalResults.find((result) => result.item.id === reranked.result.id);
  if (!original) {
    throw new NotFoundError(
      `Reranked result not found in original results: ${reranked.result.id}`,
      {
        operation: "fromRerankedResult",
        metadata: { resultId: reranked.result.id },
      }
    );
  }
  return {
    item: original.item,
    similarity: reranked.finalScore, // Use final score as new similarity
  };
};
