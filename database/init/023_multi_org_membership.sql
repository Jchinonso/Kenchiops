-- Migration 023: Multi-Organization Membership
--
-- Phase 1 of multi-org tenant isolation.
-- Adds provider column to tenants, creates user_organizations join table,
-- seeds existing relationships, and renames tenant_id to selected_tenant_id.
--
-- This enables users to belong to multiple provider-isolated organizations.
-- A GitHub "acme" and GitLab "acme" become separate tenants.
--
-- ROLLBACK:
--   ALTER TABLE users RENAME COLUMN selected_tenant_id TO tenant_id;
--   DROP TABLE IF EXISTS user_organizations;
--   ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_org_name_provider_unique;
--   ALTER TABLE tenants ADD CONSTRAINT tenants_github_org_key UNIQUE (org_name);
--   ALTER TABLE tenants DROP COLUMN IF EXISTS provider;

-- ==================== Step 1: Add provider column to tenants ====================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS provider VARCHAR(50);

-- Backfill from provider_connections
UPDATE tenants SET provider = 'github'
WHERE provider IS NULL
  AND id IN (SELECT DISTINCT tenant_id FROM provider_connections WHERE provider = 'github_app');

UPDATE tenants SET provider = 'gitlab'
WHERE provider IS NULL
  AND id IN (SELECT DISTINCT tenant_id FROM provider_connections WHERE provider = 'gitlab');

-- Default remaining tenants to github (created before provider tracking)
UPDATE tenants SET provider = 'github' WHERE provider IS NULL;

ALTER TABLE tenants ALTER COLUMN provider SET NOT NULL;

-- Replace UNIQUE(org_name) with UNIQUE(org_name, provider)
-- The original constraint was created as `github_org VARCHAR(255) NOT NULL UNIQUE`
-- which generates `tenants_github_org_key`. After rename to org_name, the
-- constraint name stayed the same.
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_github_org_key;
ALTER TABLE tenants ADD CONSTRAINT tenants_org_name_provider_unique UNIQUE (org_name, provider);

-- ==================== Step 2: Create user_organizations join table ====================

CREATE TABLE IF NOT EXISTS user_organizations (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'uor_' || replace(gen_random_uuid()::text, '-', ''),
    user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    is_default BOOLEAN NOT NULL DEFAULT false,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_user_organizations_user ON user_organizations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_organizations_tenant ON user_organizations(tenant_id);

-- Trigger for updated_at
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'user_organizations_updated_at') THEN
        CREATE TRIGGER user_organizations_updated_at
            BEFORE UPDATE ON user_organizations
            FOR EACH ROW EXECUTE FUNCTION update_auth_updated_at();
    END IF;
END;
$$;

-- ==================== Step 3: Seed from existing user-tenant relationships ====================

INSERT INTO user_organizations (user_id, tenant_id, role, is_default)
SELECT id, tenant_id, role, true
FROM users
WHERE tenant_id IS NOT NULL
ON CONFLICT (user_id, tenant_id) DO NOTHING;

-- ==================== Step 4: Rename tenant_id to selected_tenant_id ====================

ALTER TABLE users RENAME COLUMN tenant_id TO selected_tenant_id;

COMMENT ON TABLE user_organizations IS 'Many-to-many join table linking users to tenant organizations';
COMMENT ON COLUMN tenants.provider IS 'Git provider that owns this organization (github, gitlab)';
COMMENT ON COLUMN users.selected_tenant_id IS 'Currently selected organization for dashboard context';
