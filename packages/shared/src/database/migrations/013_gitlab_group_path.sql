-- Migration: 013_gitlab_group_path
-- Description: Add gitlab_group_path column to tenants table for GitLab-only tenant support
-- Phase: GitLab OAuth Tenant Linking

-- ==================== Column Addition ====================

-- Add nullable gitlab_group_path column for tenants created via GitLab OAuth
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'tenants'
          AND column_name = 'gitlab_group_path'
    ) THEN
        ALTER TABLE tenants ADD COLUMN gitlab_group_path VARCHAR(255) NULL;
    END IF;
END $$;

-- ==================== Indexes ====================

-- Index for efficient lookup by GitLab group path (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_tenants_gitlab_group_path
    ON tenants(LOWER(gitlab_group_path));

-- ==================== Comments ====================

COMMENT ON COLUMN tenants.gitlab_group_path IS 'GitLab group/namespace path for tenants created via GitLab OAuth';
