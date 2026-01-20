/**
 * Knowledge Document Hit Tracking
 *
 * Database operations for tracking knowledge document usage and feedback.
 * Separated from main repository for modularity.
 *
 * @module database/knowledgeDoc/hitTracking
 */

import { query, createLogger, getErrorMessage, HIT_TRACKING_QUERIES } from "../common.js";
import type { KnowledgeDocRecord, KnowledgeDocRow } from "./types.js";
import { mapRowToKnowledgeDoc, validateId, validateIds } from "./helpers.js";

const logger = createLogger("knowledge-doc-hit-tracking");

// ==================== Public API ====================

/**
 * Gets a knowledge document by ID.
 *
 * @param id - Knowledge document ID
 * @returns The knowledge document or null if not found
 * @throws ValidationError if ID is empty
 * @throws Error if database operation fails
 */
export const getKnowledgeDocById = async (id: string): Promise<KnowledgeDocRecord | null> => {
  validateId(id, "id");

  try {
    const result = await query<KnowledgeDocRow>(HIT_TRACKING_QUERIES.GET_BY_ID, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToKnowledgeDoc(result.rows[0]);
  } catch (error) {
    logger.error("Failed to get knowledge document by ID", {
      id,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Increments the hit count for a knowledge document.
 * Called when a document is retrieved in a RAG search.
 *
 * @param id - Knowledge document ID
 * @returns Updated knowledge document or null if not found
 * @throws ValidationError if ID is empty
 * @throws Error if database operation fails
 */
export const incrementKnowledgeDocHitCount = async (
  id: string
): Promise<KnowledgeDocRecord | null> => {
  validateId(id, "id");

  try {
    const result = await query<KnowledgeDocRow>(HIT_TRACKING_QUERIES.INCREMENT_HIT_COUNT, [id]);

    if (result.rows.length === 0) {
      logger.warn("Failed to increment hit count - document not found", { id });
      return null;
    }

    logger.debug("Incremented knowledge document hit count", { id });
    return mapRowToKnowledgeDoc(result.rows[0]);
  } catch (error) {
    logger.error("Failed to increment knowledge document hit count", {
      id,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Increments hit count for multiple knowledge documents at once.
 * Used for batch tracking of retrieved documents.
 *
 * @param ids - Array of knowledge document IDs
 * @returns Number of documents updated
 * @throws ValidationError if IDs array contains invalid entries
 * @throws Error if database operation fails
 */
export const batchIncrementKnowledgeDocHitCounts = async (
  ids: readonly string[]
): Promise<number> => {
  if (ids.length === 0) {
    return 0;
  }

  validateIds(ids, "ids");

  try {
    const result = await query<{ id: string }>(HIT_TRACKING_QUERIES.BATCH_INCREMENT_HIT_COUNT, [
      ids,
    ]);

    logger.debug("Batch incremented hit counts", {
      requestedCount: ids.length,
      updatedCount: result.rowCount,
    });

    return result.rowCount;
  } catch (error) {
    logger.error("Failed to batch increment knowledge document hit counts", {
      idsCount: ids.length,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Records negative feedback for a knowledge document.
 * Used to track when suggestions are not helpful.
 *
 * @param id - Knowledge document ID
 * @returns Updated knowledge document or null if not found
 * @throws ValidationError if ID is empty
 * @throws Error if database operation fails
 */
export const recordKnowledgeDocNegativeFeedback = async (
  id: string
): Promise<KnowledgeDocRecord | null> => {
  validateId(id, "id");

  try {
    const result = await query<KnowledgeDocRow>(HIT_TRACKING_QUERIES.RECORD_NEGATIVE_FEEDBACK, [
      id,
    ]);

    if (result.rows.length === 0) {
      logger.warn("Failed to record negative feedback - document not found", { id });
      return null;
    }

    logger.info("Recorded negative feedback for knowledge document", { id });
    return mapRowToKnowledgeDoc(result.rows[0]);
  } catch (error) {
    logger.error("Failed to record negative feedback for knowledge document", {
      id,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
