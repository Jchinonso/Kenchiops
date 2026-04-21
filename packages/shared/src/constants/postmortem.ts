/**
 * Postmortem Database Constants
 *
 * SQL queries and configuration for postmortem database operations.
 *
 * @module constants/postmortem
 */

// ==================== Default Values ====================

export const POSTMORTEM_DEFAULTS = {
  QUERY_LIMIT: 50,
  MAX_QUERY_LIMIT: 200,
  MIN_QUERY_LIMIT: 1,
} as const;

// ==================== SQL Query Builders ====================

const buildInsertQuery = (): string =>
  [
    "INSERT INTO postmortems (id, tenant_id, alert_id, title, status, content, created_by)",
    "VALUES ($1, $2, $3, $4, $5, $6, $7)",
    "RETURNING *",
  ].join(" ");

const buildGetByIdQuery = (): string =>
  ["SELECT * FROM postmortems", "WHERE id", "= $1 AND tenant_id", "= $2"].join(" ");

const buildListQuery = (): string =>
  [
    "SELECT * FROM postmortems",
    "WHERE tenant_id",
    "= $1",
    "AND ($2::text IS NULL OR status",
    "= $2)",
    "ORDER BY created_at DESC",
    "LIMIT $3 OFFSET $4",
  ].join(" ");

const buildCountQuery = (): string =>
  [
    "SELECT COUNT(*) as count FROM postmortems",
    "WHERE tenant_id",
    "= $1",
    "AND ($2::text IS NULL OR status",
    "= $2)",
  ].join(" ");

const buildUpdateQuery = (): string =>
  [
    "UPDATE postmortems SET",
    "title = COALESCE($3, title),",
    "content = COALESCE($4, content),",
    "status = COALESCE($5, status),",
    "updated_at = NOW()",
    "WHERE id",
    "= $1 AND tenant_id",
    "= $2",
    "RETURNING *",
  ].join(" ");

const buildPublishQuery = (): string =>
  [
    "UPDATE postmortems SET",
    "status = 'published',",
    "published_at = NOW(),",
    "updated_at = NOW()",
    "WHERE id",
    "= $1 AND tenant_id",
    "= $2",
    "RETURNING *",
  ].join(" ");

// ==================== Query Constants ====================

export const POSTMORTEM_QUERIES = {
  INSERT: buildInsertQuery(),
  GET_BY_ID: buildGetByIdQuery(),
  LIST: buildListQuery(),
  COUNT: buildCountQuery(),
  UPDATE: buildUpdateQuery(),
  PUBLISH: buildPublishQuery(),
} as const;
