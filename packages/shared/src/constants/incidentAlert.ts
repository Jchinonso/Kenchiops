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
