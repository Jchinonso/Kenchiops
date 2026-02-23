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
  /** Default number of days for confidence trend lookback. */
  DEFAULT_TREND_DAYS: 30,
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
      full_analysis, tenant_id, model_version_id, aggregation_key, ci_provider
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
    SELECT a.*,
      (SELECT e.payload->>'headSha'
       FROM events e
       WHERE e.payload->>'repository' = a.aggregation_key
         AND e.tenant_id = a.tenant_id
         AND e.payload->>'headSha' IS NOT NULL
         AND e.created_at <= a.created_at
       ORDER BY e.created_at DESC LIMIT 1) AS head_sha
    FROM analyses a
    WHERE a.tenant_id = $1
    ORDER BY a.created_at DESC
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
    SELECT a.*,
      (SELECT e.payload->>'headSha'
       FROM events e
       WHERE e.payload->>'repository' = a.aggregation_key
         AND e.tenant_id = a.tenant_id
         AND e.payload->>'headSha' IS NOT NULL
         AND e.created_at <= a.created_at
       ORDER BY e.created_at DESC LIMIT 1) AS head_sha
    FROM analyses a
    WHERE a.tenant_id = $1
      AND ($2::text IS NULL OR a.aggregation_key ILIKE '%' || $2 || '%')
      AND ($3::numeric IS NULL OR a.diagnosis_confidence >= $3)
      AND ($4::numeric IS NULL OR a.diagnosis_confidence < $4)
      AND ($5::timestamp IS NULL OR a.created_at >= $5)
      AND ($6::timestamp IS NULL OR a.created_at < $6)
      AND ($7::text IS NULL OR a.ci_provider = $7)
    ORDER BY a.created_at DESC
    LIMIT $8 OFFSET $9
  `,

  COUNT_BY_TENANT_FILTERED: `
    SELECT COUNT(*) as count FROM analyses
    WHERE tenant_id = $1
      AND ($2::text IS NULL OR aggregation_key ILIKE '%' || $2 || '%')
      AND ($3::numeric IS NULL OR diagnosis_confidence >= $3)
      AND ($4::numeric IS NULL OR diagnosis_confidence < $4)
      AND ($5::timestamp IS NULL OR created_at >= $5)
      AND ($6::timestamp IS NULL OR created_at < $6)
      AND ($7::text IS NULL OR ci_provider = $7)
  `,

  CONFIDENCE_DISTRIBUTION: `
    SELECT
      CASE
        WHEN diagnosis_confidence >= 0.8 THEN 'high'
        WHEN diagnosis_confidence >= 0.5 THEN 'medium'
        ELSE 'low'
      END AS level,
      COUNT(*)::int AS count
    FROM analyses
    WHERE tenant_id = $1
    GROUP BY level
  `,

  CONFIDENCE_TREND: `
    SELECT
      DATE_TRUNC($2, created_at)::date AS bucket,
      ROUND(AVG(diagnosis_confidence)::numeric, 3) AS avg_confidence,
      COUNT(*)::int AS count
    FROM analyses
    WHERE tenant_id = $1 AND created_at >= $3::timestamptz
    GROUP BY bucket
    ORDER BY bucket
  `,

  FIND_BY_COMMIT_SHA: `
    SELECT * FROM analyses
    WHERE tenant_id = $1
      AND RIGHT(aggregation_key, LENGTH($2) + 1) = ':' || $2
    ORDER BY created_at DESC
    LIMIT 10
  `,

  COUNT_BY_REPO: `
    SELECT
      COALESCE(
        full_analysis->>'repository',
        SPLIT_PART(aggregation_key, ':', 1)
      ) AS repository,
      COUNT(*)::text AS analysis_count
    FROM analyses
    WHERE tenant_id = $1
      AND aggregation_key IS NOT NULL
    GROUP BY repository
    ORDER BY COUNT(*) DESC
  `,
} as const;
