-- Migration 029: Data Exports (GDPR Article 20 — Right to Data Portability)
--
-- WHY: GDPR Article 20 gives data subjects the right to receive their personal data
-- in a structured, commonly used, machine-readable format. This table tracks async
-- data export jobs requested by tenant admins.
--
-- WORKFLOW:
--   1. Admin requests export via POST /api/v1/tenant/export
--   2. Row created with status = 'pending'
--   3. Background worker generates ZIP (JSON per table), uploads to secure storage
--   4. Status updated to 'completed', file_path and download_url populated
--   5. download_url is a pre-signed URL with a 72-hour TTL (expires_at)
--   6. After expiry, download_url becomes invalid; tenant can request a new export
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_data_exports_tenant_status;
--   DROP INDEX IF EXISTS idx_data_exports_expires_at;
--   DROP INDEX IF EXISTS idx_data_exports_requested_by;
--   DROP TABLE IF EXISTS data_exports;

-- ==================== Data Exports Table ====================

CREATE TABLE IF NOT EXISTS data_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which tenant requested the export
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Export lifecycle status
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired')),

    -- Who requested the export (must be an admin/owner)
    requested_by VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Storage location of the generated export file (e.g., S3 key)
    file_path TEXT,

    -- Pre-signed download URL with TTL
    download_url TEXT,

    -- When the download URL expires (typically 72 hours after completion)
    expires_at TIMESTAMPTZ,

    -- Lifecycle timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    -- Optional error message if status = 'failed'
    error_message TEXT
);

-- ==================== Indexes ====================

-- Primary lookup: "what exports exist for this tenant, by status?"
CREATE INDEX IF NOT EXISTS idx_data_exports_tenant_status
    ON data_exports (tenant_id, status);

-- Cleanup job: find expired exports to clean up storage
CREATE INDEX IF NOT EXISTS idx_data_exports_expires_at
    ON data_exports (expires_at)
    WHERE status = 'completed' AND expires_at IS NOT NULL;

-- Audit: who requested exports
CREATE INDEX IF NOT EXISTS idx_data_exports_requested_by
    ON data_exports (requested_by);

-- ==================== Comments ====================

COMMENT ON TABLE data_exports IS
  'Tracks async tenant data export jobs for GDPR Article 20 (Right to Data Portability). '
  'Each row represents one export request with its lifecycle status.';

COMMENT ON COLUMN data_exports.status IS
  'Export lifecycle: pending -> processing -> completed/failed. '
  'expired indicates the download URL has passed its TTL.';

COMMENT ON COLUMN data_exports.file_path IS
  'Internal storage path (e.g., S3 key) for the generated export ZIP file.';

COMMENT ON COLUMN data_exports.download_url IS
  'Pre-signed download URL with a 72-hour TTL. NULL until export completes.';

COMMENT ON COLUMN data_exports.expires_at IS
  'When the download_url expires. A cleanup job should mark status = expired after this.';
