/**
 * Analysis Constants
 *
 * SQL queries and configuration for analysis operations.
 *
 * @module constants/analysis
 */

// ==================== Default Values ====================

/**
 * Default configuration for analysis operations.
 */
export const ANALYSIS_DEFAULTS = {
  /** Default limit for model version queries. */
  MODEL_VERSION_QUERY_LIMIT: 100,
  /** Minimum valid limit for queries. */
  MIN_QUERY_LIMIT: 1,
} as const;

// ==================== SQL Queries ====================

/**
 * SQL query templates for analysis operations.
 */
export const ANALYSIS_QUERIES = {
  INSERT: `
    INSERT INTO analyses (
      id, event_id, summary, identified_cause, diagnosis_confidence,
      action_confidence, confidence_signals, recommended_actions,
      full_analysis, tenant_id, model_version_id, aggregation_key
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *
  `,

  GET_BY_ID: `
    SELECT * FROM analyses WHERE id = $1
  `,

  GET_BY_EVENT_ID: `
    SELECT * FROM analyses WHERE event_id = $1
  `,

  GET_BY_MODEL_VERSION: `
    SELECT * FROM analyses
    WHERE model_version_id = $1
    ORDER BY created_at DESC
    LIMIT $2
  `,

  COUNT_BY_MODEL_VERSION: `
    SELECT COUNT(*) as count FROM analyses
    WHERE model_version_id = $1
  `,
} as const;
