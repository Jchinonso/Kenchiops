/**
 * Data Retention Constants
 *
 * SQL queries and configuration for data retention policy enforcement.
 *
 * @module constants/retention
 */

// ==================== Default TTLs (in days) ====================

export const RETENTION_DEFAULTS = {
  /** Default retention for audit logs in days (SOC 2 minimum). */
  AUDIT_LOG_DAYS: 365,
  /** Default retention for webhook activity in days. */
  WEBHOOK_DAYS: 90,
  /** Default retention for analyses in days. */
  ANALYSIS_DAYS: 180,
  /** Default retention for events in days. */
  EVENT_DAYS: 90,
  /** Default limit for batch deletes to avoid long-running transactions. */
  BATCH_DELETE_LIMIT: 1000,
} as const;

// ==================== SQL Queries ====================

export const RETENTION_QUERIES = {
  GET_POLICY: `
    SELECT * FROM tenant_retention_policies
    WHERE tenant_id = $1
  `,

  /** Upsert using tenant_id as PK (ON CONFLICT on the PK). */
  UPSERT_POLICY: `
    INSERT INTO tenant_retention_policies (tenant_id, audit_log_days, analysis_days, event_days, webhook_days)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (tenant_id) DO UPDATE SET
      audit_log_days = EXCLUDED.audit_log_days,
      analysis_days = EXCLUDED.analysis_days,
      event_days = EXCLUDED.event_days,
      webhook_days = EXCLUDED.webhook_days,
      updated_at = NOW()
    RETURNING *
  `,

  /** Delete old audit logs. Uses batch limit to avoid holding locks too long. */
  PURGE_AUDIT_LOGS: `
    DELETE FROM tenant_audit_log
    WHERE id IN (
      SELECT id FROM tenant_audit_log
      WHERE tenant_id = $1
        AND created_at < NOW() - INTERVAL '1 day' * $2
      LIMIT $3
    )
  `,

  /** Delete old webhook activity. */
  PURGE_WEBHOOK_ACTIVITY: `
    DELETE FROM webhook_activity_log
    WHERE id IN (
      SELECT id FROM webhook_activity_log
      WHERE tenant_id = $1
        AND created_at < NOW() - INTERVAL '1 day' * $2
      LIMIT $3
    )
  `,

  /** Delete old analyses. */
  PURGE_ANALYSES: `
    DELETE FROM analyses
    WHERE id IN (
      SELECT id FROM analyses
      WHERE tenant_id = $1
        AND created_at < NOW() - INTERVAL '1 day' * $2
      LIMIT $3
    )
  `,

  /** Delete old events. */
  PURGE_EVENTS: `
    DELETE FROM events
    WHERE id IN (
      SELECT id FROM events
      WHERE tenant_id = $1
        AND created_at < NOW() - INTERVAL '1 day' * $2
      LIMIT $3
    )
  `,
} as const;
