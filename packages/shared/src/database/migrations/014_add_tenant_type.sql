-- Add tenant_type column to distinguish organization vs personal tenants.
-- Personal tenants are created as a fallback when a GitHub user has no orgs.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS tenant_type VARCHAR(20) NOT NULL DEFAULT 'organization';

ALTER TABLE tenants
  ADD CONSTRAINT valid_tenant_type CHECK (tenant_type IN ('organization', 'personal'));

-- Replace the simple unique constraint with a partial unique index that:
-- 1. Uses LOWER(org_name) for case-insensitive matching
-- 2. Excludes deleted tenants so an org can be re-installed after deletion
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_org_provider_active
  ON tenants (LOWER(org_name), provider)
  WHERE status != 'deleted';

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_org_name_provider_unique;
