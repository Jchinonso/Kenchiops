-- Migration 036: Case-insensitive unique constraint on tenants (FLAW-14)
--
-- Prevents duplicate tenants with different casing (e.g., "Acme" and "acme").
-- The partial index excludes deleted tenants so the same name can be reused.

-- Drop legacy constraint if it exists
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_org_name_provider_unique;

-- Create case-insensitive partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_org_provider_unique
  ON tenants (LOWER(org_name), provider)
  WHERE status != 'deleted';
