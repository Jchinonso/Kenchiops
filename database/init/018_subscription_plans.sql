-- Migration 018: Subscription Plans
--
-- WHY: Kenchi needs tiered access control (Free / Pro / Team / Enterprise)
-- with per-tenant plan assignment and feature limit enforcement.
-- No billing integration yet -- just DB-backed plan system with limits
-- checked at the service layer.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS update_tenant_subscriptions_updated_at ON tenant_subscriptions;
--   DROP INDEX IF EXISTS idx_tenant_subscriptions_tenant;
--   DROP INDEX IF EXISTS idx_tenant_subscriptions_plan;
--   DROP INDEX IF EXISTS idx_tenant_subscriptions_status;
--   DROP TABLE IF EXISTS tenant_subscriptions;
--   DROP TABLE IF EXISTS plans;

-- ==================== Plans Table (Reference Data) ====================

CREATE TABLE IF NOT EXISTS plans (
    id VARCHAR(50) PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL,
    price_monthly_cents INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0,

    -- Numeric limits (NULL = unlimited)
    max_repositories INTEGER,
    max_analyses_monthly INTEGER,
    max_integrations INTEGER,
    max_team_members INTEGER,

    -- Boolean feature flags
    slack_integration BOOLEAN NOT NULL DEFAULT false,
    custom_rules BOOLEAN NOT NULL DEFAULT false,
    team_analytics BOOLEAN NOT NULL DEFAULT false,
    sso_saml BOOLEAN NOT NULL DEFAULT false,
    audit_log BOOLEAN NOT NULL DEFAULT false,
    api_access BOOLEAN NOT NULL DEFAULT false,
    priority_support BOOLEAN NOT NULL DEFAULT false,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE plans IS 'Reference table defining subscription plan tiers and their limits/features';
COMMENT ON COLUMN plans.price_monthly_cents IS 'Monthly price in cents (0 = free, NULL = custom/enterprise)';
COMMENT ON COLUMN plans.max_repositories IS 'NULL means unlimited';
COMMENT ON COLUMN plans.max_analyses_monthly IS 'NULL means unlimited';

-- Seed all four tiers (idempotent)
INSERT INTO plans (
    id, display_name, price_monthly_cents, sort_order,
    max_repositories, max_analyses_monthly, max_integrations, max_team_members,
    slack_integration, custom_rules, team_analytics,
    sso_saml, audit_log, api_access, priority_support
)
VALUES
    ('free',       'Free',       0,     0, 3,    50,   1,    1,
     false, false, false, false, false, false, false),
    ('pro',        'Pro',        4900,  1, NULL, NULL, 5,    10,
     true,  true,  true,  false, false, true,  true),
    ('team',       'Team',       14900, 2, NULL, NULL, NULL, 50,
     true,  true,  true,  false, true,  true,  true),
    ('enterprise', 'Enterprise', NULL,  3, NULL, NULL, NULL, NULL,
     true,  true,  true,  true,  true,  true,  true)
ON CONFLICT (id) DO NOTHING;

-- ==================== Tenant Subscriptions Table ====================

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL UNIQUE,
    plan_id VARCHAR(50) NOT NULL DEFAULT 'free',
    status VARCHAR(50) NOT NULL DEFAULT 'active',

    -- Billing readiness (future Stripe integration)
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Trial support
    trial_ends_at TIMESTAMPTZ,

    -- Lifecycle
    changed_by VARCHAR(255),
    changed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT fk_tenant_subscriptions_plan
        FOREIGN KEY (plan_id) REFERENCES plans(id),
    CONSTRAINT valid_subscription_status CHECK (
        status IN ('active', 'trialing', 'past_due', 'canceled')
    )
);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant
    ON tenant_subscriptions(tenant_id);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_plan
    ON tenant_subscriptions(plan_id);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_status
    ON tenant_subscriptions(status);

CREATE TRIGGER update_tenant_subscriptions_updated_at
    BEFORE UPDATE ON tenant_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE tenant_subscriptions IS 'Per-tenant plan assignment. Each tenant has at most one row.';
COMMENT ON COLUMN tenant_subscriptions.metadata IS 'Reserved for billing provider references (e.g., Stripe IDs)';
COMMENT ON COLUMN tenant_subscriptions.changed_by IS 'User ID who last changed the plan. NULL for system-created rows.';
