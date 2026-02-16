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

  GET_BY_TENANT_TYPE_FILTERED: `
    SELECT * FROM events
    WHERE tenant_id = $1 AND type = $2
      AND ($3::text IS NULL OR payload->>'repository' ILIKE '%' || $3 || '%')
      AND ($4::text IS NULL OR severity = $4)
      AND ($5::timestamp IS NULL OR created_at >= $5)
      AND ($6::timestamp IS NULL OR created_at < $6)
    ORDER BY created_at DESC
    LIMIT $7 OFFSET $8
  `,

  COUNT_BY_TENANT_TYPE_FILTERED: `
    SELECT COUNT(*) as count FROM events
    WHERE tenant_id = $1 AND type = $2
      AND ($3::text IS NULL OR payload->>'repository' ILIKE '%' || $3 || '%')
      AND ($4::text IS NULL OR severity = $4)
      AND ($5::timestamp IS NULL OR created_at >= $5)
      AND ($6::timestamp IS NULL OR created_at < $6)
  `,

  FIND_BY_REPO_AND_COMMIT: `
    SELECT id FROM events
    WHERE tenant_id = $1
      AND payload->>'repository' = $2
      AND payload->>'headSha' = $3
    ORDER BY created_at DESC
    LIMIT 1
  `,
} as const;
