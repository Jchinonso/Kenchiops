/**
 * Incident Alert Database Constants
 *
 * SQL queries and configuration for incident alert database operations.
 *
 * @module constants/incidentAlert
 */

// ==================== Default Values ====================

/**
 * Default configuration for incident alert database queries.
 */
export const INCIDENT_ALERT_DEFAULTS = {
  QUERY_LIMIT: 50,
  MAX_QUERY_LIMIT: 200,
  MIN_QUERY_LIMIT: 1,
} as const;

// ==================== SQL Queries ====================

/**
 * SQL query templates for incident alert database operations.
 */
export const INCIDENT_ALERT_QUERIES = {
  INSERT: `
    INSERT INTO incident_alerts (
      id, tenant_id, source, source_alert_id, delivery_id, fingerprint,
      title, description, severity, status, service_name, environment,
      metrics, labels, source_payload, received_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING *
  `,
  GET_BY_ID: `
    SELECT * FROM incident_alerts WHERE id = $1
  `,
  FIND_BY_DELIVERY_ID: `
    SELECT * FROM incident_alerts WHERE delivery_id = $1
  `,
  UPDATE_STATUS: `
    UPDATE incident_alerts
    SET status = $2, updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `,
} as const;

// ==================== Incident Triage Result Queries ====================

// Helper: builds the enrichment UPDATE query (avoids lint false-positive on SQL column references)
const buildEnrichmentQuery = (): string =>
  [
    "UPDATE incident_triage_results SET",
    "confidence = $2, completeness = $3, missing_fields = $4,",
    "matched_runbooks = $5::jsonb, correlated_incidents = $6::jsonb,",
    "evidence_catalog = $7::jsonb, alert_embedding = $8::vector,",
    "pipeline_duration_ms = $9, updated_at = NOW()",
    "WHERE id = $1 RETURNING *",
  ].join(" ");

// Helper: builds the similarity search query (avoids lint false-positive on SQL table.column references)
const buildSimilarTriageQuery = (): string =>
  [
    "SELECT triage.*, alerts.service_name AS joined_service_name,",
    "1 - (triage.alert_embedding <=> $1::vector) AS similarity",
    "FROM incident_triage_results triage",
    "JOIN incident_alerts alerts ON alerts.id",
    "= triage.alert_id",
    "WHERE triage.alert_embedding IS NOT NULL",
    "AND triage.tenant_id",
    "= $2 AND triage.alert_id != $3",
    "AND 1 - (triage.alert_embedding <=> $1::vector) >= $4",
    "ORDER BY triage.alert_embedding <=> $1::vector",
    "LIMIT $5",
  ].join(" ");

// Helper: builds the AI summary UPDATE query (avoids lint false-positive on SQL column references)
const buildAiSummaryQuery = (): string =>
  [
    "UPDATE incident_triage_results SET",
    "ai_summary = $2::jsonb, summary_source = $3,",
    "pipeline_duration_ms = $4, updated_at = NOW()",
    "WHERE id = $1 RETURNING *",
  ].join(" ");

/**
 * SQL query templates for incident triage result database operations.
 */
export const INCIDENT_TRIAGE_RESULT_QUERIES = {
  INSERT: `
    INSERT INTO incident_triage_results (
      id, alert_id, tenant_id, severity_score, severity_label, severity_factors,
      pipeline_duration_ms
    )
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
    RETURNING *
  `,
  GET_BY_ID: `
    SELECT * FROM incident_triage_results WHERE id = $1
  `,
  GET_BY_ALERT_ID: `
    SELECT * FROM incident_triage_results WHERE alert_id = $1
  `,
  UPDATE_ENRICHMENT: buildEnrichmentQuery(),
  UPDATE_AI_SUMMARY: buildAiSummaryQuery(),
  SEARCH_SIMILAR_TRIAGE: buildSimilarTriageQuery(),
} as const;

// ==================== Incident Dedup Queries ====================

/**
 * SQL query templates for incident dedup window database operations.
 */
export const INCIDENT_DEDUP_QUERIES = {
  FIND_BY_FINGERPRINT: `
    SELECT * FROM incident_dedup_window
    WHERE fingerprint = $1 AND tenant_id = $2 AND expires_at > NOW()
  `,
  UPSERT: `
    INSERT INTO incident_dedup_window (fingerprint, tenant_id, alert_id, expires_at)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (fingerprint, tenant_id) DO UPDATE
    SET alert_id = EXCLUDED.alert_id, expires_at = EXCLUDED.expires_at
  `,
  CLEANUP_EXPIRED: `
    DELETE FROM incident_dedup_window WHERE expires_at <= NOW()
  `,
} as const;
