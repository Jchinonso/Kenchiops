-- Migration 017: CI Provider Connections
--
-- WHY: Kenchi currently only supports GitHub Actions. This migration adds
-- infrastructure for multi-provider CI/CD log analysis by tracking per-tenant
-- CI provider configurations and adding provider tracking to existing analysis tables.
--
-- ROLLBACK:
--   ALTER TABLE analyses DROP COLUMN IF EXISTS ci_provider;
--   ALTER TABLE analysis_jobs DROP COLUMN IF EXISTS ci_provider;
--   DROP TRIGGER IF EXISTS update_provider_connections_updated_at ON provider_connections;
--   DROP TABLE IF EXISTS provider_connections;

-- ==================== Provider Connections Table ====================

CREATE TABLE IF NOT EXISTS provider_connections (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'prc_' || replace(gen_random_uuid()::text, '-', ''),
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN (
        'github_actions', 'vercel', 'netlify', 'aws_codebuild',
        'gitlab_ci', 'circleci', 'bitbucket_pipelines', 'custom'
    )),
    connection_name VARCHAR(255) NOT NULL,
    external_org_id VARCHAR(255),
    base_url TEXT,
    config JSONB NOT NULL DEFAULT '{}',
    webhook_secret_enc TEXT,
    access_token_enc TEXT,
    token_expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, provider, connection_name)
);

CREATE INDEX IF NOT EXISTS idx_provider_connections_tenant_active
    ON provider_connections(tenant_id, provider) WHERE is_active = true;

CREATE TRIGGER update_provider_connections_updated_at
    BEFORE UPDATE ON provider_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE provider_connections IS 'Per-tenant CI/CD provider connections with configuration and credentials';
COMMENT ON COLUMN provider_connections.webhook_secret_enc IS 'Encrypted at application layer before storage';
COMMENT ON COLUMN provider_connections.access_token_enc IS 'Encrypted at application layer before storage';
COMMENT ON COLUMN provider_connections.config IS 'Provider-specific JSONB config for settings not covered by explicit columns';

-- ==================== Add ci_provider to Existing Tables ====================

-- Add as nullable with no default. Existing rows remain NULL until backfilled.
-- New code paths must set ci_provider explicitly on insert.
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS ci_provider TEXT;
ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS ci_provider TEXT;

CREATE INDEX IF NOT EXISTS idx_analyses_ci_provider
    ON analyses(ci_provider) WHERE ci_provider IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_ci_provider
    ON analysis_jobs(ci_provider) WHERE ci_provider IS NOT NULL;
