/**
 * Webhook Activity Database Constants
 *
 * SQL queries and configuration for webhook activity database operations.
 *
 * @module constants/webhookActivity
 */

// ==================== Default Values ====================

/**
 * Default configuration for webhook activity database queries.
 */
export const WEBHOOK_ACTIVITY_DEFAULTS = {
  QUERY_LIMIT: 50,
  MAX_QUERY_LIMIT: 200,
  MIN_QUERY_LIMIT: 1,
} as const;

// ==================== SQL Queries ====================

/**
 * SQL query templates for webhook activity database operations.
 */
export const WEBHOOK_ACTIVITY_QUERIES = {
  INSERT: `
    INSERT INTO webhook_activity (id, tenant_id, delivery_id, event_type, source, status, processing_time_ms, error_message, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `,
  GET_BY_TENANT: `
    SELECT * FROM webhook_activity
    WHERE tenant_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `,
  GET_BY_TENANT_FILTERED: `
    SELECT * FROM webhook_activity
    WHERE tenant_id = $1
      AND ($2::text IS NULL OR source = $2)
      AND ($3::text IS NULL OR status = $3)
    ORDER BY created_at DESC
    LIMIT $4 OFFSET $5
  `,
  COUNT_BY_TENANT: `
    SELECT COUNT(*) as count FROM webhook_activity WHERE tenant_id = $1
  `,
  COUNT_BY_TENANT_FILTERED: `
    SELECT COUNT(*) as count FROM webhook_activity
    WHERE tenant_id = $1
      AND ($2::text IS NULL OR source = $2)
      AND ($3::text IS NULL OR status = $3)
  `,
} as const;
