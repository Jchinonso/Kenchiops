/**
 * Cost Tracking Constants
 *
 * SQL queries and configuration for RAG cost tracking operations.
 *
 * @module constants/costTracking
 */

// ==================== Default Values ====================

/**
 * Default configuration for cost tracking operations.
 */
export const COST_TRACKING_DEFAULTS = {
  /** Default number of days for trend queries. */
  TREND_DAYS: 30,
  /** Default limit for top consumers query. */
  TOP_CONSUMERS_LIMIT: 10,
  /** Default cost retention in days. */
  RETENTION_DAYS: 90,
  /** Decimal precision for cost values. */
  COST_DECIMAL_PRECISION: 8,
  /** Minimum valid token count. */
  MIN_TOKEN_COUNT: 0,
  /** Minimum valid days for queries. */
  MIN_DAYS: 1,
  /** Minimum valid limit for queries. */
  MIN_LIMIT: 1,
} as const;

// ==================== SQL Queries ====================

/**
 * SQL query templates for cost tracking operations.
 */
export const COST_TRACKING_QUERIES = {
  INSERT: `
    INSERT INTO rag_cost_tracking (
      id, tenant_id, operation_type, embedding_tier, token_count, cost_usd, recorded_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    RETURNING *
  `,

  GET_MONTHLY_SUMMARY: `
    SELECT
      tenant_id,
      SUM(cost_usd::numeric) as total_cost,
      SUM(token_count) as total_tokens,
      SUM(CASE WHEN operation_type = 'embedding' THEN cost_usd::numeric ELSE 0 END) as embedding_cost,
      SUM(CASE WHEN operation_type = 'query' THEN cost_usd::numeric ELSE 0 END) as query_cost
    FROM rag_cost_tracking
    WHERE tenant_id = $1
      AND recorded_at >= DATE_TRUNC('month', NOW())
    GROUP BY tenant_id
  `,

  GET_MONTHLY_BY_TIER: `
    SELECT
      embedding_tier,
      SUM(token_count) as total_tokens,
      SUM(cost_usd::numeric) as total_cost
    FROM rag_cost_tracking
    WHERE tenant_id = $1
      AND recorded_at >= DATE_TRUNC('month', NOW())
    GROUP BY embedding_tier
  `,

  GET_DAILY_COSTS: `
    SELECT
      DATE_TRUNC('day', recorded_at) as day,
      SUM(cost_usd::numeric) as total_cost,
      SUM(token_count) as total_tokens
    FROM rag_cost_tracking
    WHERE tenant_id = $1
      AND recorded_at >= NOW() - ($2 || ' days')::INTERVAL
    GROUP BY DATE_TRUNC('day', recorded_at)
    ORDER BY day ASC
  `,

  DELETE_OLD: `
    DELETE FROM rag_cost_tracking
    WHERE recorded_at < NOW() - ($1 || ' days')::INTERVAL
  `,

  GET_TOP_CONSUMERS: `
    SELECT
      tenant_id,
      SUM(cost_usd::numeric) as total_cost,
      SUM(token_count) as total_tokens
    FROM rag_cost_tracking
    WHERE recorded_at >= DATE_TRUNC('month', NOW())
    GROUP BY tenant_id
    ORDER BY total_cost DESC
    LIMIT $1
  `,
} as const;
