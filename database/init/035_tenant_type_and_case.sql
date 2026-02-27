-- Migration 035: Add tenant_type column and normalize org_name case
--
-- FLAW-05: Distinguish personal accounts from organization tenants.
-- FLAW-10: Ensure org_name is stored lowercase for consistent matching.

-- Add tenant_type column
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tenant_type VARCHAR(32) NOT NULL DEFAULT 'organization';

-- Backfill: mark single-member GitHub tenants as 'personal' where the sole
-- member's own GitHub username matches the tenant org_name.
-- The JOIN ensures we don't misclassify single-member organizations that
-- coincidentally share a name with some unrelated GitHub user.
UPDATE tenants t SET tenant_type = 'personal'
WHERE t.provider = 'github'
  AND (SELECT COUNT(*) FROM user_organizations uo2 WHERE uo2.tenant_id = t.id) = 1
  AND EXISTS (
    SELECT 1
    FROM user_organizations uo
    JOIN oauth_identities oi
      ON oi.user_id = uo.user_id AND oi.provider = 'github'
    WHERE uo.tenant_id = t.id
      AND LOWER(oi.provider_username) = LOWER(t.org_name)
  );

-- Normalize existing org_name values to lowercase
UPDATE tenants SET org_name = LOWER(org_name) WHERE org_name != LOWER(org_name);
