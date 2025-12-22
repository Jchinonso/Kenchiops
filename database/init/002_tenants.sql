-- Kenchi Multi-Tenant Schema
-- This migration adds the tenants table for multi-tenant support

-- ==================== Tenants Table ====================

-- Tenants table: Links GitHub organizations to Slack workspaces
-- Each row represents one customer using Kenchi
CREATE TABLE IF NOT EXISTS tenants (
    -- Primary key
    id VARCHAR(50) PRIMARY KEY DEFAULT 'ten_' || replace(uuid_generate_v4()::text, '-', ''),

    -- GitHub App integration
    github_org VARCHAR(255) NOT NULL UNIQUE,
    github_installation_id INTEGER UNIQUE,
    github_app_installed_at TIMESTAMPTZ,

    -- Slack App integration
    slack_workspace_id VARCHAR(255) UNIQUE,
    slack_team_name VARCHAR(255),
    slack_bot_token TEXT,  -- Encrypted at application level
    slack_bot_user_id VARCHAR(255),  -- Bot's user ID for self-identification
    slack_app_installed_at TIMESTAMPTZ,

    -- Tenant status
    -- 'pending_slack' = GitHub installed, awaiting Slack
    -- 'pending_github' = Slack installed, awaiting GitHub
    -- 'active' = Both installed, ready to use
    -- 'suspended' = Temporarily disabled
    -- 'deleted' = Soft deleted
    status VARCHAR(50) NOT NULL DEFAULT 'pending_slack',

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_tenant_status CHECK (
        status IN ('pending_slack', 'pending_github', 'active', 'suspended', 'deleted')
    )
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_tenants_github_installation ON tenants(github_installation_id);
CREATE INDEX IF NOT EXISTS idx_tenants_slack_workspace ON tenants(slack_workspace_id);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_github_org ON tenants(github_org);

-- Updated_at trigger
CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==================== Tenant Audit Log ====================

-- Audit log for tenant lifecycle events
CREATE TABLE IF NOT EXISTS tenant_audit_log (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'aud_' || replace(uuid_generate_v4()::text, '-', ''),
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    -- Actions: 'github_installed', 'github_uninstalled', 'slack_installed',
    -- 'slack_uninstalled', 'activated', 'suspended', 'deleted',
    -- 'ci_failure_processed', 'slack_message_sent', 'github_comment_posted'
    actor VARCHAR(255),  -- Who performed the action (user ID, system, etc.)
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_audit_tenant ON tenant_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_audit_action ON tenant_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_tenant_audit_created ON tenant_audit_log(created_at DESC);

-- ==================== Comments ====================

COMMENT ON TABLE tenants IS 'Multi-tenant registry linking GitHub orgs to Slack workspaces';
COMMENT ON COLUMN tenants.github_org IS 'GitHub organization login name (e.g., "acme-corp")';
COMMENT ON COLUMN tenants.github_installation_id IS 'GitHub App installation ID for this org';
COMMENT ON COLUMN tenants.slack_workspace_id IS 'Slack workspace/team ID (e.g., "T0ACME123")';
COMMENT ON COLUMN tenants.slack_bot_token IS 'Slack bot OAuth token (encrypted at app level)';
COMMENT ON COLUMN tenants.status IS 'Tenant lifecycle status';

COMMENT ON TABLE tenant_audit_log IS 'Audit trail for tenant lifecycle events';

-- ==================== Update Events Table ====================

-- Add tenant_id to events table for tenant isolation
ALTER TABLE events
ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) REFERENCES tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_tenant ON events(tenant_id);

-- ==================== Update Analyses Table ====================

-- Add tenant_id to analyses table for tenant isolation
ALTER TABLE analyses
ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) REFERENCES tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_analyses_tenant ON analyses(tenant_id);

-- ==================== Update Slack Messages Table ====================

-- Add tenant_id to slack_messages table for tenant isolation
ALTER TABLE slack_messages
ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50) REFERENCES tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_slack_messages_tenant ON slack_messages(tenant_id);

-- ==================== Helper Views ====================

-- View of active tenants with full integration
CREATE OR REPLACE VIEW active_tenants AS
SELECT
    id,
    github_org,
    github_installation_id,
    slack_workspace_id,
    slack_team_name,
    created_at
FROM tenants
WHERE status = 'active'
  AND github_installation_id IS NOT NULL
  AND slack_workspace_id IS NOT NULL;

COMMENT ON VIEW active_tenants IS 'Active tenants with both GitHub and Slack connected';
