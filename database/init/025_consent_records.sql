-- Migration 025: Consent Records (GDPR / Privacy Compliance)
--
-- WHY: GDPR Articles 6-7 require explicit, auditable consent records. Users must be
-- able to grant and withdraw consent for specific purposes (analytics, AI training,
-- marketing), and the system must prove when consent was given or withdrawn.
--
-- DESIGN DECISIONS:
--   - Append-only table: no UPDATE or DELETE from the application layer.
--     Each consent change is a new INSERT with action = 'granted' or 'withdrawn'.
--   - Materialized view for fast runtime lookups of current consent status.
--   - The mat view uses DISTINCT ON to get the latest action per (user, tenant, purpose).
--
-- ROLLBACK:
--   DROP MATERIALIZED VIEW IF EXISTS consent_status_current;
--   DROP INDEX IF EXISTS idx_consent_status_current_lookup;
--   DROP INDEX IF EXISTS idx_consent_records_user_tenant_purpose;
--   DROP INDEX IF EXISTS idx_consent_records_tenant;
--   DROP INDEX IF EXISTS idx_consent_records_created_at;
--   DROP TABLE IF EXISTS consent_records;

-- ==================== Consent Records Table ====================

CREATE TABLE IF NOT EXISTS consent_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- What consent is for (e.g., 'analytics', 'ai_training', 'marketing')
    purpose VARCHAR(100) NOT NULL,

    -- Whether consent was 'granted' or 'withdrawn'
    action VARCHAR(20) NOT NULL CHECK (action IN ('granted', 'withdrawn')),

    -- Version of the privacy notice the user agreed to
    privacy_notice_version VARCHAR(50) NOT NULL,

    -- Request metadata for audit trail
    ip_address INET,
    user_agent TEXT,

    -- Immutable timestamp — append-only, never updated
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== Indexes ====================

-- Primary lookup: "what is user X's latest consent for purpose Y in tenant Z?"
-- Composite index ordered for the materialized view's DISTINCT ON pattern.
CREATE INDEX IF NOT EXISTS idx_consent_records_user_tenant_purpose
    ON consent_records (user_id, tenant_id, purpose, created_at DESC);

-- Tenant-scoped queries (e.g., "show all consent records for this tenant")
CREATE INDEX IF NOT EXISTS idx_consent_records_tenant
    ON consent_records (tenant_id);

-- Time-based queries for retention/audit (e.g., "consent changes in last 30 days")
CREATE INDEX IF NOT EXISTS idx_consent_records_created_at
    ON consent_records (created_at DESC);

-- ==================== Materialized View for Fast Lookups ====================
-- Returns the latest consent action per (user_id, tenant_id, purpose).
-- Refresh this view after bulk consent changes or periodically via cron.
--
-- Usage: SELECT action FROM consent_status_current
--        WHERE user_id = $1 AND tenant_id = $2 AND purpose = $3;
--
-- If no row exists, consent has never been recorded for that combination.

CREATE MATERIALIZED VIEW IF NOT EXISTS consent_status_current AS
SELECT DISTINCT ON (user_id, tenant_id, purpose)
    user_id,
    tenant_id,
    purpose,
    action,
    privacy_notice_version,
    created_at
FROM consent_records
ORDER BY user_id, tenant_id, purpose, created_at DESC;

-- Index on the materialized view for fast point lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_consent_status_current_lookup
    ON consent_status_current (user_id, tenant_id, purpose);

-- ==================== Comments ====================

COMMENT ON TABLE consent_records IS
  'Append-only audit trail of user consent grants and withdrawals (GDPR Articles 6-7). '
  'Never UPDATE or DELETE rows from the application layer.';

COMMENT ON COLUMN consent_records.purpose IS
  'Consent purpose identifier: analytics, ai_training, marketing, etc.';

COMMENT ON COLUMN consent_records.action IS
  'Whether consent was granted or withdrawn at this point in time';

COMMENT ON COLUMN consent_records.privacy_notice_version IS
  'Version string of the privacy notice the user agreed to (e.g., "2026-02-01-v2")';

COMMENT ON MATERIALIZED VIEW consent_status_current IS
  'Materialized view of the latest consent action per (user_id, tenant_id, purpose). '
  'Must be refreshed after consent changes via REFRESH MATERIALIZED VIEW CONCURRENTLY.';
