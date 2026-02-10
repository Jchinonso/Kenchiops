/**
 * Metrics History Constants
 *
 * SQL queries and configuration for RAG metrics history operations.
 *
 * @module constants/metricsHistory
 */

// ==================== Default Values ====================

/**
 * Default configuration for metrics history operations.
 */
export const METRICS_HISTORY_DEFAULTS = {
  /** Default sample size when recording a metric. */
  DEFAULT_SAMPLE_SIZE: 1,
  /** Default retention period in days for cleanup operations. */
  DEFAULT_RETENTION_DAYS: 90,
  /** Minimum valid query limit. */
  MIN_QUERY_LIMIT: 1,
  /** Threshold for stable direction detection (percentage). */
  STABLE_DIRECTION_THRESHOLD: 1,
} as const;

// ==================== SQL Queries ====================

/**
 * SQL query templates for metrics history operations.
 */
export const METRICS_HISTORY_QUERIES = {
  INSERT: `
    INSERT INTO rag_metrics_history (
      id, tenant_id, metric_type, metric_value, sample_size, metadata, recorded_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    RETURNING *
  `,

  GET_RECENT: `
    SELECT * FROM rag_metrics_history
    WHERE metric_type = $1
      AND (tenant_id = $2 OR ($2 IS NULL AND tenant_id IS NULL))
    ORDER BY recorded_at DESC
    LIMIT $3
  `,

  GET_BASELINE: `
    SELECT
      metric_type,
      AVG(metric_value::numeric) as avg_value,
      STDDEV(metric_value::numeric) as std_dev,
      COUNT(*) as sample_count
    FROM rag_metrics_history
    WHERE metric_type = $1
      AND (tenant_id = $2 OR ($2 IS NULL AND tenant_id IS NULL))
      AND recorded_at >= NOW() - ($3 || ' days')::INTERVAL
    GROUP BY metric_type
  `,

  GET_ALL_BASELINES: `
    SELECT
      metric_type,
      AVG(metric_value::numeric) as avg_value,
      STDDEV(metric_value::numeric) as std_dev,
      COUNT(*) as sample_count
    FROM rag_metrics_history
    WHERE (tenant_id = $1 OR ($1 IS NULL AND tenant_id IS NULL))
      AND recorded_at >= NOW() - ($2 || ' days')::INTERVAL
    GROUP BY metric_type
  `,

  GET_TREND: `
    SELECT
      DATE_TRUNC('day', recorded_at) as day,
      AVG(metric_value::numeric) as avg_value
    FROM rag_metrics_history
    WHERE metric_type = $1
      AND (tenant_id = $2 OR ($2 IS NULL AND tenant_id IS NULL))
      AND recorded_at >= NOW() - ($3 || ' days')::INTERVAL
    GROUP BY DATE_TRUNC('day', recorded_at)
    ORDER BY day ASC
  `,

  DELETE_OLD: `
    DELETE FROM rag_metrics_history
    WHERE recorded_at < NOW() - ($1 || ' days')::INTERVAL
  `,

  COUNT_BY_TYPE: `
    SELECT metric_type, COUNT(*) as count
    FROM rag_metrics_history
    WHERE (tenant_id = $1 OR ($1 IS NULL AND tenant_id IS NULL))
    GROUP BY metric_type
  `,
} as const;
