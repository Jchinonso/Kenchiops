/**
 * Event Database Constants
 *
 * SQL queries and configuration for event database operations.
 *
 * @module constants/event
 */

// ==================== Default Values ====================

/**
 * Default configuration for event database queries.
 */
export const EVENT_DB_DEFAULTS = {
  QUERY_LIMIT: 50,
  MAX_QUERY_LIMIT: 200,
  MIN_QUERY_LIMIT: 1,
} as const;

// ==================== SQL Queries ====================

/**
 * SQL query templates for event database operations.
 */
export const EVENT_DB_QUERIES = {
  INSERT: `
    INSERT INTO events (id, type, source, severity, timestamp, payload, metadata, tenant_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `,
  GET_BY_TENANT: `
    SELECT * FROM events
    WHERE tenant_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `,
  GET_BY_TENANT_AND_TYPE: `
    SELECT * FROM events
    WHERE tenant_id = $1 AND type = $2
    ORDER BY created_at DESC
    LIMIT $3 OFFSET $4
  `,
  COUNT_BY_TENANT: `
    SELECT COUNT(*) as count FROM events WHERE tenant_id = $1
  `,
  COUNT_BY_TENANT_AND_TYPE: `
    SELECT COUNT(*) as count FROM events WHERE tenant_id = $1 AND type = $2
  `,
} as const;
