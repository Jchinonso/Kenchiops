-- Seed Data
--
-- Reference data that must exist for the application to function.
-- All statements are idempotent (ON CONFLICT DO NOTHING).
-- Run after every migration to ensure seed data is present.

-- ==================== Model Versions ====================

INSERT INTO model_versions (
    id, name, model_id, description, created_at, is_baseline
) VALUES (
    'base_v1', 'Base Model', 'gpt-4o-mini',
    'Default baseline model for CI failure analysis', NOW(), TRUE
) ON CONFLICT (id) DO NOTHING;

-- ==================== Model Feature Flags ====================

INSERT INTO model_feature_flags (
    id, default_model_version, rollback_enabled, rollback_model_version,
    rollback_active, ab_test_enabled, tenant_overrides
) VALUES (
    'default', 'base_v1', TRUE, 'base_v1', FALSE, FALSE, '{}'
) ON CONFLICT (id) DO NOTHING;

-- ==================== Subscription Plans ====================

INSERT INTO plans (
    id, display_name, price_monthly_cents, sort_order,
    max_repositories, max_analyses_monthly, max_integrations, max_team_members,
    slack_integration, custom_rules, team_analytics,
    sso_saml, audit_log, api_access, priority_support
)
VALUES
    ('free',       'Free',       0,     0, NULL, NULL, NULL, NULL,
     false, false, false, false, false, false, false),
    ('pro',        'Pro',        4900,  1, NULL, NULL, 5,    10,
     true,  true,  true,  false, false, true,  true),
    ('team',       'Team',       14900, 2, NULL, NULL, NULL, 50,
     true,  true,  true,  false, true,  true,  true),
    ('enterprise', 'Enterprise', NULL,  3, NULL, NULL, NULL, NULL,
     true,  true,  true,  true,  true,  true,  true)
ON CONFLICT (id) DO NOTHING;
