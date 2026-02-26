-- Migration 034: Billing Integration (Stripe)
--
-- WHY: Adds Stripe-specific columns to tenant_subscriptions and plans tables
-- to support payment processing, checkout sessions, and subscription lifecycle.
--
-- ROLLBACK:
--   ALTER TABLE tenant_subscriptions DROP COLUMN IF EXISTS stripe_customer_id;
--   ALTER TABLE tenant_subscriptions DROP COLUMN IF EXISTS stripe_subscription_id;
--   ALTER TABLE tenant_subscriptions DROP COLUMN IF EXISTS current_period_end;
--   ALTER TABLE plans DROP COLUMN IF EXISTS stripe_price_id_monthly;
--   ALTER TABLE plans DROP COLUMN IF EXISTS stripe_price_id_yearly;
--   DROP TABLE IF EXISTS billing_events;

-- ==================== Stripe columns on tenant_subscriptions ====================

ALTER TABLE tenant_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer
  ON tenant_subscriptions(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub
  ON tenant_subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

COMMENT ON COLUMN tenant_subscriptions.stripe_customer_id IS 'Stripe Customer ID (cus_xxx)';
COMMENT ON COLUMN tenant_subscriptions.stripe_subscription_id IS 'Stripe Subscription ID (sub_xxx)';
COMMENT ON COLUMN tenant_subscriptions.current_period_end IS 'End of current billing period (from Stripe)';

-- ==================== Stripe price IDs on plans ====================

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS stripe_price_id_monthly VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_price_id_yearly VARCHAR(255);

COMMENT ON COLUMN plans.stripe_price_id_monthly IS 'Stripe Price ID for monthly billing (price_xxx)';
COMMENT ON COLUMN plans.stripe_price_id_yearly IS 'Stripe Price ID for yearly billing (price_xxx)';

-- ==================== Billing event log ====================
-- Append-only log of all billing events for audit and debugging.

CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stripe_event_id VARCHAR(255) NOT NULL UNIQUE,
  event_type VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'processed'
    CHECK (status IN ('processed', 'failed', 'skipped')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_tenant
  ON billing_events(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_events_stripe_event
  ON billing_events(stripe_event_id);

COMMENT ON TABLE billing_events IS 'Append-only log of Stripe webhook events for audit trail';
