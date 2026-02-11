/**
 * Analysis Context Store
 *
 * Stores analysis context from CI failure messages for later lesson extraction.
 * When users provide positive feedback, we retrieve this context to create lessons.
 *
 * @module services/analysisContextStore
 */

import { logger, ANALYSIS_CONTEXT_STORE_CONFIG, type AggregatedFailures } from "@kenchi/shared";
import type { StoredAnalysisContext } from "./analysisContextStoreTypes.js";

// ==================== Store ====================

/**
 * In-memory store for analysis context.
 * Key format: "repository:commitSha" (same as analysisId)
 */
const analysisContextStore = new Map<string, StoredAnalysisContext>();

// ==================== Cleanup ====================

/**
 * Cleanup old context entries to prevent memory leaks.
 */
const cleanupOldContext = (): void => {
  const now = Date.now();

  const keysToDelete = Array.from(analysisContextStore.entries())
    .filter(
      ([, context]) => now - context.storedAt.getTime() > ANALYSIS_CONTEXT_STORE_CONFIG.MAX_AGE_MS
    )
    .map(([key]) => key);

  keysToDelete.forEach((key) => analysisContextStore.delete(key));

  if (keysToDelete.length > 0) {
    logger.info("Cleaned up old analysis context entries", {
      deletedCount: keysToDelete.length,
      remainingCount: analysisContextStore.size,
    });
  }
};

// Start periodic cleanup
setInterval(cleanupOldContext, ANALYSIS_CONTEXT_STORE_CONFIG.CLEANUP_INTERVAL_MS);

// ==================== Public API ====================

/**
 * Build analysis context key from repository and commit SHA.
 */
export const buildAnalysisKey = (repository: string, commitSha: string): string =>
  `${repository}:${commitSha}`;

/**
 * Parse an analysis ID into repository and commit SHA components.
 */
export const parseAnalysisId = (
  analysisId: string
): { repository: string; commitSha: string } | null => {
  const parts = analysisId.split(":");
  if (parts.length < 2) {
    return null;
  }

  // Handle repository names with colons (unlikely but safe)
  const commitSha = parts[parts.length - 1];
  const repository = parts.slice(0, -1).join(":");

  return { repository, commitSha };
};

/**
 * Store analysis context for later lesson extraction.
 *
 * @param aggregation - The aggregated failures with analysis
 * @param channelId - The Slack channel where posted
 * @param messageTs - The message timestamp
 * @param tenantId - Optional tenant ID
 */
export const storeAnalysisContext = (
  aggregation: AggregatedFailures,
  channelId: string,
  messageTs: string,
  tenantId?: string
): void => {
  const key = buildAnalysisKey(aggregation.repository.fullName, aggregation.commitSha);

  analysisContextStore.set(key, {
    aggregation,
    channelId,
    messageTs,
    storedAt: new Date(),
    tenantId,
  });

  logger.debug("Stored analysis context", {
    key,
    failureCount: aggregation.failures.length,
    storeSize: analysisContextStore.size,
  });
};

/**
 * Retrieve stored analysis context by analysis ID.
 *
 * @param analysisId - The analysis ID (repository:commitSha)
 * @returns The stored context or undefined if not found
 */
export const getAnalysisContext = (analysisId: string): StoredAnalysisContext | undefined => {
  const context = analysisContextStore.get(analysisId);

  if (context) {
    logger.debug("Retrieved analysis context", {
      analysisId,
      failureCount: context.aggregation.failures.length,
      age: Date.now() - context.storedAt.getTime(),
    });
  } else {
    logger.debug("Analysis context not found", { analysisId });
  }

  return context;
};

/**
 * Delete analysis context (after lesson extraction or on cleanup).
 *
 * @param analysisId - The analysis ID to delete
 * @returns True if deleted, false if not found
 */
export const deleteAnalysisContext = (analysisId: string): boolean => {
  const deleted = analysisContextStore.delete(analysisId);

  if (deleted) {
    logger.debug("Deleted analysis context", { analysisId });
  }

  return deleted;
};

/**
 * Get the current store size (for monitoring/debugging).
 */
export const getContextStoreSize = (): number => analysisContextStore.size;

/**
 * Clear all stored context (for testing).
 */
export const clearContextStore = (): void => {
  analysisContextStore.clear();
};
