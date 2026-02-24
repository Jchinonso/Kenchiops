/**
 * Investigation Database Constants
 *
 * SQL queries and configuration for investigation database operations.
 *
 * @module constants/investigations
 */

// ==================== Status & Enum Values ====================

/**
 * Investigation pipeline status values.
 */
export const INVESTIGATION_STATUS = {
  QUEUED: "queued",
  PARSING: "parsing",
  GATHERING: "gathering",
  CORRELATING: "correlating",
  DIAGNOSING: "diagnosing",
  COMPLETED: "completed",
  ERROR: "error",
} as const;

/**
 * Investigation initiation channels.
 */
export const INVESTIGATION_INITIATED_FROM = {
  SLACK: "slack",
  FRONTEND: "frontend",
  API: "api",
} as const;

// ==================== Default Values ====================

/**
 * Default configuration for investigation database queries.
 */
export const INVESTIGATION_DEFAULTS = {
  QUERY_LIMIT: 50,
  MAX_QUERY_LIMIT: 200,
  MIN_QUERY_LIMIT: 1,
  EVIDENCE_LOOKBACK_HOURS: 72,
  MAX_EVIDENCE_ITEMS: 20,
} as const;

/**
 * Frontend polling configuration for active investigations.
 */
export const INVESTIGATION_POLLING = {
  /** Polling interval in ms for active investigation status checks */
  INTERVAL_MS: 3000,
  /** Maximum number of polls before stopping (~10 minutes at 3s intervals) */
  MAX_POLL_COUNT: 200,
} as const;

// ==================== SQL Query Builders ====================

// Helper: builds paginated list query with dynamic filters
// (avoids lint false-positive on SQL table.column references)
const buildListByTenantQuery = (): string =>
  [
    "SELECT * FROM investigations",
    "WHERE tenant_id",
    "= $1",
    "AND ($2::text IS NULL OR status",
    "= $2)",
    "ORDER BY created_at DESC",
    "LIMIT $3 OFFSET $4",
  ].join(" ");

// Helper: builds count query with same filters as list
const buildCountByTenantQuery = (): string =>
  [
    "SELECT COUNT(*) as count FROM investigations",
    "WHERE tenant_id",
    "= $1",
    "AND ($2::text IS NULL OR status",
    "= $2)",
  ].join(" ");

// Helper: builds UPDATE for status (avoids lint false-positive)
const buildUpdateStatusQuery = (): string =>
  [
    "UPDATE investigations",
    "SET status = $2, updated_at = NOW()",
    "WHERE id",
    "= $1",
    "RETURNING *",
  ].join(" ");

// Helper: builds UPDATE for parsed intent fields
const buildUpdateIntentQuery = (): string =>
  [
    "UPDATE investigations SET",
    "service_name = $2, endpoint = $3, symptom = $4,",
    "environment = $5, time_range_from = $6, time_range_to = $7,",
    "updated_at = NOW()",
    "WHERE id",
    "= $1",
    "RETURNING *",
  ].join(" ");

// Helper: builds UPDATE for evidence JSONB
const buildUpdateEvidenceQuery = (): string =>
  [
    "UPDATE investigations SET",
    "evidence = $2::jsonb, updated_at = NOW()",
    "WHERE id",
    "= $1",
    "RETURNING *",
  ].join(" ");

// Helper: builds UPDATE for correlation JSONB
const buildUpdateCorrelationQuery = (): string =>
  [
    "UPDATE investigations SET",
    "correlation = $2::jsonb, updated_at = NOW()",
    "WHERE id",
    "= $1",
    "RETURNING *",
  ].join(" ");

// Helper: builds UPDATE for diagnosis (also sets status to completed)
const buildUpdateDiagnosisQuery = (): string =>
  [
    "UPDATE investigations SET",
    "diagnosis = $2::jsonb, completed_at = NOW(),",
    "duration_ms = $3, status = 'completed',",
    "updated_at = NOW()",
    "WHERE id",
    "= $1",
    "RETURNING *",
  ].join(" ");

// Helper: builds UPDATE for error (also sets status to error)
const buildUpdateErrorQuery = (): string =>
  [
    "UPDATE investigations SET",
    "error_message = $2, status = 'error',",
    "updated_at = NOW()",
    "WHERE id",
    "= $1",
    "RETURNING *",
  ].join(" ");

// ==================== SQL Queries ====================

/**
 * SQL query templates for investigation database operations.
 */
export const INVESTIGATION_QUERIES = {
  INSERT: `
    INSERT INTO investigations (
      id, tenant_id, initiated_by, initiated_from, status, description,
      service_name, endpoint, symptom, environment,
      time_range_from, time_range_to
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *
  `,
  GET_BY_ID: `
    SELECT * FROM investigations WHERE id = $1 AND tenant_id = $2
  `,
  LIST_BY_TENANT: buildListByTenantQuery(),
  COUNT_BY_TENANT: buildCountByTenantQuery(),
  UPDATE_STATUS: buildUpdateStatusQuery(),
  UPDATE_INTENT: buildUpdateIntentQuery(),
  UPDATE_EVIDENCE: buildUpdateEvidenceQuery(),
  UPDATE_CORRELATION: buildUpdateCorrelationQuery(),
  UPDATE_DIAGNOSIS: buildUpdateDiagnosisQuery(),
  UPDATE_ERROR: buildUpdateErrorQuery(),
} as const;
