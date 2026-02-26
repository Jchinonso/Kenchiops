/**
 * Knowledge Document Hit Tracking Constants
 *
 * SQL queries and configuration for knowledge document usage tracking.
 *
 * @module constants/knowledgeDocHitTracking
 */

// ==================== Default Values ====================

/**
 * Default configuration for hit tracking operations.
 */
export const HIT_TRACKING_DEFAULTS = {
  /** Default hit count for new documents. */
  DEFAULT_HIT_COUNT: 0,
  /** Default negative feedback count for new documents. */
  DEFAULT_NEGATIVE_FEEDBACK_COUNT: 0,
} as const;

// ==================== SQL Queries ====================

/**
 * SQL query templates for hit tracking operations.
 */
export const HIT_TRACKING_QUERIES = {
  INCREMENT_HIT_COUNT: `
    UPDATE knowledge_documents
    SET metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{hitCount}',
      (COALESCE((metadata->>'hitCount')::int, 0) + 1)::text::jsonb
    ),
    updated_at = NOW()
    WHERE id = $1 AND tenant_id = $2
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
    WHERE id = ANY($1) AND tenant_id = $2
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
    WHERE id = $1 AND tenant_id = $2
    RETURNING *
  `,

  GET_BY_ID: `
    SELECT * FROM knowledge_documents WHERE id = $1 AND tenant_id = $2
  `,
} as const;
