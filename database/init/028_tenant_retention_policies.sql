-- Migration 028: Tenant Data Retention Policies
--
-- WHY: GDPR Article 5(1)(e) requires storage limitation — data should not be kept
-- longer than necessary. Different tenants may have different regulatory requirements
-- (e.g., financial services may need longer audit log retention).
--
-- This table stores per-tenant retention overrides. A scheduled retention job reads
-- these values and deletes rows older than the configured thresholds. If no row
-- exists for a tenant, system-wide defaults apply.
--
-- DEFAULT RETENTION PERIODS:
--   audit_log_days:  365 (1 year — SOC 2 minimum)
--   analysis_days:   180 (6 months)
--   event_days:       90 (3 months)
--   webhook_days:     90 (3 months)
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS update_tenant_retention_policies_updated_at ON tenant_retention_policies;
--   DROP TABLE IF EXISTS tenant_retention_policies;

-- ==================== Retention Policies Table ====================

CREATE TABLE IF NOT EXISTS tenant_retention_policies (
    -- 1:1 with tenants — each tenant has at most one retention config
    tenant_id VARCHAR(50) PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,

    -- Retention periods in days. Rows older than these thresholds are purged
    -- by the scheduled retention job. NULL means "use system default".
    audit_log_days INTEGER NOT NULL DEFAULT 365,
    analysis_days INTEGER NOT NULL DEFAULT 180,
    event_days INTEGER NOT NULL DEFAULT 90,
    webhook_days INTEGER NOT NULL DEFAULT 90,

    -- Last modification timestamp
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Sanity constraints: retention must be at least 1 day
    CONSTRAINT valid_audit_log_days CHECK (audit_log_days >= 1),
    CONSTRAINT valid_analysis_days CHECK (analysis_days >= 1),
    CONSTRAINT valid_event_days CHECK (event_days >= 1),
    CONSTRAINT valid_webhook_days CHECK (webhook_days >= 1)
);

-- ==================== Trigger ====================

-- Auto-update updated_at on modification
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_tenant_retention_policies_updated_at') THEN
        CREATE TRIGGER update_tenant_retention_policies_updated_at
            BEFORE UPDATE ON tenant_retention_policies
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END;
$$;

-- ==================== Comments ====================

COMMENT ON TABLE tenant_retention_policies IS
  'Per-tenant data retention overrides. The scheduled retention job reads these values '
  'to determine how long to keep audit logs, analyses, events, and webhook activity. '
  'If no row exists for a tenant, system-wide defaults from constants apply.';

COMMENT ON COLUMN tenant_retention_policies.audit_log_days IS
  'Days to retain tenant_audit_log entries. Default 365 (SOC 2 minimum).';

COMMENT ON COLUMN tenant_retention_policies.analysis_days IS
  'Days to retain analyses. Default 180 (6 months).';

COMMENT ON COLUMN tenant_retention_policies.event_days IS
  'Days to retain events. Default 90 (3 months).';

COMMENT ON COLUMN tenant_retention_policies.webhook_days IS
  'Days to retain webhook_activity entries. Default 90 (3 months).';
