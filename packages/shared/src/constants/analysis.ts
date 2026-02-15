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
  /** Default limit for tenant queries. */
  TENANT_QUERY_LIMIT: 50,
  /** Maximum limit for tenant queries. */
  MAX_TENANT_QUERY_LIMIT: 200,
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

  GET_BY_TENANT: `
    SELECT * FROM analyses
    WHERE tenant_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `,

  COUNT_BY_TENANT: `
    SELECT COUNT(*) as count FROM analyses
    WHERE tenant_id = $1
  `,

  GET_BY_EVENT_IDS: `
    SELECT id, event_id, diagnosis_confidence FROM analyses
    WHERE event_id = ANY($1) AND tenant_id = $2
  `,

  GET_BY_TENANT_FILTERED: `
    SELECT * FROM analyses
    WHERE tenant_id = $1
      AND ($2::text IS NULL OR aggregation_key ILIKE '%' || $2 || '%')
      AND ($3::numeric IS NULL OR diagnosis_confidence >= $3)
      AND ($4::numeric IS NULL OR diagnosis_confidence < $4)
    ORDER BY created_at DESC
    LIMIT $5 OFFSET $6
  `,

  COUNT_BY_TENANT_FILTERED: `
    SELECT COUNT(*) as count FROM analyses
    WHERE tenant_id = $1
      AND ($2::text IS NULL OR aggregation_key ILIKE '%' || $2 || '%')
      AND ($3::numeric IS NULL OR diagnosis_confidence >= $3)
      AND ($4::numeric IS NULL OR diagnosis_confidence < $4)
  `,
} as const;
