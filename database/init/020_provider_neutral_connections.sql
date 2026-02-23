-- Migration 020: Provider-Neutral Connections
--
-- Phase 2 of provider-neutral tenant refactor.
-- Expands provider_connections to hold GitHub App, Slack, and GitLab
-- platform integrations (previously stored directly on the tenants row).
--
-- ROLLBACK:
--   DELETE FROM provider_connections WHERE provider IN ('github_app', 'slack', 'gitlab');
--   ALTER TABLE provider_connections DROP CONSTRAINT IF EXISTS provider_connections_provider_check;
--   ALTER TABLE provider_connections ADD CONSTRAINT provider_connections_provider_check CHECK (
--       provider IN ('github_actions', 'vercel', 'netlify', 'aws_codebuild',
--                    'gitlab_ci', 'circleci', 'bitbucket_pipelines', 'custom')
--   );

-- ==================== Step 1: Expand provider CHECK constraint ====================

-- Drop the existing CHECK constraint and add expanded one
ALTER TABLE provider_connections DROP CONSTRAINT IF EXISTS provider_connections_provider_check;
ALTER TABLE provider_connections ADD CONSTRAINT provider_connections_provider_check CHECK (
    provider IN (
        -- CI/CD source integrations
        'github_actions', 'vercel', 'netlify', 'aws_codebuild',
        'gitlab_ci', 'circleci', 'bitbucket_pipelines', 'custom',
        -- Platform integrations (GitHub App, GitLab platform)
        'github_app', 'gitlab',
        -- Notification channels
        'slack'
    )
);

-- ==================== Step 2: Seed from tenants columns ====================

-- Migrate GitHub App data
INSERT INTO provider_connections (tenant_id, provider, connection_name, external_org_id, config)
SELECT
    id,
    'github_app',
    org_name,
    github_installation_id::TEXT,
    jsonb_build_object(
        'org_login', org_name,
        'installed_at', github_app_installed_at
    )
FROM tenants
WHERE github_installation_id IS NOT NULL
ON CONFLICT (tenant_id, provider, connection_name) DO NOTHING;

-- Migrate Slack data
INSERT INTO provider_connections (tenant_id, provider, connection_name, external_org_id, access_token_enc, config)
SELECT
    id,
    'slack',
    COALESCE(slack_team_name, 'default'),
    slack_workspace_id,
    slack_bot_token,
    jsonb_build_object(
        'team_name', slack_team_name,
        'bot_user_id', slack_bot_user_id,
        'installed_at', slack_app_installed_at
    )
FROM tenants
WHERE slack_workspace_id IS NOT NULL
ON CONFLICT (tenant_id, provider, connection_name) DO NOTHING;

-- Migrate GitLab platform data
INSERT INTO provider_connections (tenant_id, provider, connection_name, external_org_id, config)
SELECT
    id,
    'gitlab',
    gitlab_group_path,
    gitlab_group_path,
    jsonb_build_object('group_path', gitlab_group_path)
FROM tenants
WHERE gitlab_group_path IS NOT NULL
ON CONFLICT (tenant_id, provider, connection_name) DO NOTHING;
