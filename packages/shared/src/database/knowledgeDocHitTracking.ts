/**
 * Knowledge Document Hit Tracking
 *
 * Database operations for tracking knowledge document usage and feedback.
 * Separated from main repository for modularity.
 *
 * @module database/knowledgeDocHitTracking
 */

import { query } from "./client.js";
import { createLogger } from "../core/logger.js";
import {
  type KnowledgeDocRecord,
  type KnowledgeDocRow,
  mapRowToKnowledgeDoc,
} from "./vectorTypes.js";

const logger = createLogger("knowledge-doc-hit-tracking");

// ==================== SQL Queries ====================

const HIT_TRACKING_QUERIES = {
  INCREMENT_HIT_COUNT: `
    UPDATE knowledge_documents
    SET metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{hitCount}',
      (COALESCE((metadata->>'hitCount')::int, 0) + 1)::text::jsonb
    ),
    updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `,

  BATCH_INCREMENT_HIT_COUNT: `
    UPDATE knowledge_documents
    SET metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{hitCount}',
      (COALESCE((metadata->>'hitCount')::int, 0) + 1)::text::jsonb
    ),
    updated_at = NOW()
    WHERE id = ANY($1)
    RETURNING id
  `,

  RECORD_NEGATIVE_FEEDBACK: `
    UPDATE knowledge_documents
    SET metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{negativeFeedbackCount}',
      (COALESCE((metadata->>'negativeFeedbackCount')::int, 0) + 1)::text::jsonb
    ),
    updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `,

  GET_BY_ID: `
    SELECT * FROM knowledge_documents WHERE id = $1
  `,
} as const;

// ==================== Public API ====================

/**
 * Gets a knowledge document by ID.
 *
 * @param id - Knowledge document ID
 * @returns The knowledge document or null if not found
 */
export const getKnowledgeDocById = async (id: string): Promise<KnowledgeDocRecord | null> => {
  const result = await query<KnowledgeDocRow>(HIT_TRACKING_QUERIES.GET_BY_ID, [id]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToKnowledgeDoc(result.rows[0]);
};

/**
 * Increments the hit count for a knowledge document.
 * Called when a document is retrieved in a RAG search.
 *
 * @param id - Knowledge document ID
 * @returns Updated knowledge document or null if not found
 */
export const incrementKnowledgeDocHitCount = async (
  id: string
): Promise<KnowledgeDocRecord | null> => {
  const result = await query<KnowledgeDocRow>(HIT_TRACKING_QUERIES.INCREMENT_HIT_COUNT, [id]);

  if (result.rows.length === 0) {
    logger.warn("Failed to increment hit count - document not found", { id });
    return null;
  }

  logger.debug("Incremented knowledge document hit count", { id });
  return mapRowToKnowledgeDoc(result.rows[0]);
};

/**
 * Increments hit count for multiple knowledge documents at once.
 * Used for batch tracking of retrieved documents.
 *
 * @param ids - Array of knowledge document IDs
 * @returns Number of documents updated
 */
export const batchIncrementKnowledgeDocHitCounts = async (
  ids: readonly string[]
): Promise<number> => {
  if (ids.length === 0) {
    return 0;
  }

  const result = await query<{ id: string }>(HIT_TRACKING_QUERIES.BATCH_INCREMENT_HIT_COUNT, [ids]);

  logger.debug("Batch incremented hit counts", {
    requestedCount: ids.length,
    updatedCount: result.rowCount,
  });

  return result.rowCount;
};

/**
 * Records negative feedback for a knowledge document.
 * Used to track when suggestions are not helpful.
 *
 * @param id - Knowledge document ID
 * @returns Updated knowledge document or null if not found
 */
export const recordKnowledgeDocNegativeFeedback = async (
  id: string
): Promise<KnowledgeDocRecord | null> => {
  const result = await query<KnowledgeDocRow>(HIT_TRACKING_QUERIES.RECORD_NEGATIVE_FEEDBACK, [id]);

  if (result.rows.length === 0) {
    logger.warn("Failed to record negative feedback - document not found", { id });
    return null;
  }

  logger.info("Recorded negative feedback for knowledge document", { id });
  return mapRowToKnowledgeDoc(result.rows[0]);
};
