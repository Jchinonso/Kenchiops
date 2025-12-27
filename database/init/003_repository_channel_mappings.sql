-- Repository Channel Mappings
-- Maps GitHub repositories to Slack channels for CI failure notifications
-- Each repository can only be mapped to one channel per tenant

CREATE TABLE IF NOT EXISTS repository_channel_mappings (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'rcm_' || replace(uuid_generate_v4()::text, '-', ''),
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    repository VARCHAR(255) NOT NULL,  -- Full repo name: "owner/repo"
    slack_channel_id VARCHAR(50) NOT NULL,
    slack_channel_name VARCHAR(100),
    created_by VARCHAR(255),  -- Slack user ID who created the mapping
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, repository),  -- One channel per repo per tenant
    UNIQUE(tenant_id, slack_channel_id)  -- One repo per channel per tenant
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_rcm_tenant ON repository_channel_mappings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rcm_repository ON repository_channel_mappings(repository);
CREATE INDEX IF NOT EXISTS idx_rcm_channel ON repository_channel_mappings(slack_channel_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_rcm_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_rcm_updated_at ON repository_channel_mappings;
CREATE TRIGGER trigger_rcm_updated_at
    BEFORE UPDATE ON repository_channel_mappings
    FOR EACH ROW
    EXECUTE FUNCTION update_rcm_updated_at();
