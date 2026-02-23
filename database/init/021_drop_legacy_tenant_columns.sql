-- Migration 021: Drop Legacy Tenant Columns
--
-- Phase 2 of provider-neutral tenant refactor.
-- Removes provider-specific columns from tenants now that data lives
-- in provider_connections (seeded by migration 020).
--
-- IMPORTANT: This migration is destructive. Ensure migration 020 has
-- run successfully before applying this one.
--
-- ROLLBACK: Requires restoring columns and backfilling from provider_connections.

-- ==================== Step 1: Simplify status ====================

-- Migrate pending statuses to active (providers are independent now)
UPDATE tenants SET status = 'active' WHERE status IN ('pending_slack', 'pending_github');

-- Drop old constraint and add simplified one
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS valid_tenant_status;
ALTER TABLE tenants ADD CONSTRAINT valid_tenant_status CHECK (
    status IN ('active', 'suspended', 'deleted')
);

-- ==================== Step 2: Drop the view that references old columns ====================

DROP VIEW IF EXISTS active_tenants;

-- ==================== Step 3: Drop legacy columns ====================

ALTER TABLE tenants DROP COLUMN IF EXISTS github_installation_id;
ALTER TABLE tenants DROP COLUMN IF EXISTS github_app_installed_at;
ALTER TABLE tenants DROP COLUMN IF EXISTS slack_workspace_id;
ALTER TABLE tenants DROP COLUMN IF EXISTS slack_team_name;
ALTER TABLE tenants DROP COLUMN IF EXISTS slack_bot_token;
ALTER TABLE tenants DROP COLUMN IF EXISTS slack_bot_user_id;
ALTER TABLE tenants DROP COLUMN IF EXISTS slack_app_installed_at;
ALTER TABLE tenants DROP COLUMN IF EXISTS gitlab_group_path;

-- ==================== Step 4: Recreate view using provider_connections ====================

CREATE OR REPLACE VIEW active_tenants AS
SELECT
    t.id,
    t.org_name,
    t.status,
    t.created_at,
    gh.external_org_id AS github_installation_id,
    sl.external_org_id AS slack_workspace_id
FROM tenants t
LEFT JOIN provider_connections gh
    ON gh.tenant_id = t.id AND gh.provider = 'github_app' AND gh.is_active = true
LEFT JOIN provider_connections sl
    ON sl.tenant_id = t.id AND sl.provider = 'slack' AND sl.is_active = true
WHERE t.status = 'active';

COMMENT ON VIEW active_tenants IS 'Active tenants with optional GitHub and Slack connections via provider_connections';
