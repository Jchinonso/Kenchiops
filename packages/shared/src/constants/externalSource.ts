/**
 * External Source Constants
 *
 * SQL queries and configuration for external source repository operations.
 *
 * @module constants/externalSource
 */

// ==================== Default Values ====================

/**
 * Default configuration for external source operations.
 */
export const EXTERNAL_SOURCE_DEFAULTS = {
  /** Default limit for sync queries. */
  DEFAULT_SYNC_LIMIT: 10,
  /** Minimum valid query limit. */
  MIN_QUERY_LIMIT: 1,
  /** Default count when no rows found. */
  DEFAULT_COUNT: "0",
  /** Minimum valid doc count. */
  MIN_DOC_COUNT: 0,
  /** Minimum valid error count. */
  MIN_ERROR_COUNT: 0,
} as const;

// ==================== SQL Queries ====================

/**
 * SQL query templates for external source operations.
 */
export const EXTERNAL_SOURCE_QUERIES = {
  INSERT: `
    INSERT INTO external_sources (
      id, tenant_id, source_type, name, base_url, auth_config,
      tech_stack_tags, is_enabled, credibility_score, sync_frequency_hours, metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, $9, $10)
    RETURNING *
  `,

  GET_BY_ID: `SELECT * FROM external_sources WHERE id = $1 AND tenant_id = $2`,

  GET_BY_TENANT: `
    SELECT * FROM external_sources
    WHERE tenant_id = $1
    ORDER BY created_at DESC
  `,

  GET_ENABLED_BY_TENANT: `
    SELECT * FROM external_sources
    WHERE tenant_id = $1 AND is_enabled = TRUE
    ORDER BY credibility_score DESC
  `,

  GET_BY_TYPE: `
    SELECT * FROM external_sources
    WHERE tenant_id = $1 AND source_type = $2
  `,

  GET_DUE_FOR_SYNC: `
    SELECT * FROM external_sources
    WHERE is_enabled = TRUE
      AND (last_sync_at IS NULL OR
           last_sync_at < NOW() - (sync_frequency_hours || ' hours')::INTERVAL)
    ORDER BY last_sync_at ASC NULLS FIRST
    LIMIT $1
  `,

  UPDATE: `
    UPDATE external_sources SET
      name = COALESCE($2, name),
      base_url = COALESCE($3, base_url),
      auth_config = COALESCE($4, auth_config),
      tech_stack_tags = COALESCE($5, tech_stack_tags),
      is_enabled = COALESCE($6, is_enabled),
      credibility_score = COALESCE($7, credibility_score),
      sync_frequency_hours = COALESCE($8, sync_frequency_hours),
      metadata = COALESCE($9, metadata),
      updated_at = NOW()
    WHERE id = $1 AND tenant_id = $10
    RETURNING *
  `,

  UPDATE_SYNC_STATUS: `
    UPDATE external_sources SET
      last_sync_at = NOW(),
      doc_count = $2,
      error_count = $3,
      updated_at = NOW()
    WHERE id = $1 AND tenant_id = $4
    RETURNING *
  `,

  DELETE: `DELETE FROM external_sources WHERE id = $1 AND tenant_id = $2`,

  DELETE_BY_TENANT: `DELETE FROM external_sources WHERE tenant_id = $1`,

  COUNT_BY_TENANT: `
    SELECT COUNT(*) as count FROM external_sources WHERE tenant_id = $1
  `,
} as const;
