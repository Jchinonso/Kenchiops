-- Tenant RAG Budget Configuration
-- Adds columns for per-tenant embedding budget and tier configuration

-- ==================== Add RAG Budget Columns to Tenants ====================

ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS rag_monthly_budget_usd NUMERIC(10, 4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS rag_preferred_tier VARCHAR(20) DEFAULT 'STANDARD',
ADD COLUMN IF NOT EXISTS rag_allow_premium BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS rag_degrade_on_budget_warning BOOLEAN DEFAULT true;

-- Constraints
ALTER TABLE tenants
ADD CONSTRAINT valid_rag_tier CHECK (
    rag_preferred_tier IN ('LIGHT', 'STANDARD', 'PREMIUM')
);

-- Comments
COMMENT ON COLUMN tenants.rag_monthly_budget_usd IS 'Monthly RAG embedding budget in USD (0 = unlimited)';
COMMENT ON COLUMN tenants.rag_preferred_tier IS 'Preferred embedding tier: LIGHT, STANDARD, or PREMIUM';
COMMENT ON COLUMN tenants.rag_allow_premium IS 'Whether tenant can use PREMIUM tier embeddings';
COMMENT ON COLUMN tenants.rag_degrade_on_budget_warning IS 'Auto-downgrade tier when approaching budget limit';
