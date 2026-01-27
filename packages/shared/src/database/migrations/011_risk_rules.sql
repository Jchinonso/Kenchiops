-- Migration: 011_risk_rules
-- Description: Create tables for custom risk rules and risk assessment audit trail
-- Phase: Enhanced Risk Scoring with Context Awareness

-- ==================== Custom Risk Rules ====================

-- Custom risk rules allow tenants to override default risk assessments
CREATE TABLE IF NOT EXISTS custom_risk_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,

    -- Rule identification
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Matching criteria
    action_types TEXT[] NOT NULL,
    environment VARCHAR(50),  -- 'production', 'staging', 'development', NULL = all

    -- Risk factor overrides (NULL = use default)
    blast_radius VARCHAR(50),      -- 'single_service', 'multiple_services', 'infrastructure'
    reversibility VARCHAR(50),     -- 'instant', 'minutes', 'manual_only', 'irreversible'
    data_impact VARCHAR(50),       -- 'none', 'read_only', 'write', 'destructive'

    -- Score modifiers
    score_modifier DECIMAL(3,2) DEFAULT 0,              -- -1.0 to +1.0 adjustment to base score
    production_multiplier DECIMAL(3,2) DEFAULT 1.0,     -- Multiplier for production environment
    incident_mode_multiplier DECIMAL(3,2) DEFAULT 1.0,  -- Multiplier when incident mode active
    off_hours_multiplier DECIMAL(3,2) DEFAULT 1.0,      -- Multiplier during off-hours

    -- Approval thresholds (NULL = use global defaults)
    require_approval_threshold DECIMAL(3,2),  -- Score threshold to require approval
    block_threshold DECIMAL(3,2),             -- Score threshold to block execution

    -- Rule state
    enabled BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 100,  -- Lower = higher priority (checked first)

    -- Audit fields
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT valid_environment CHECK (
        environment IS NULL OR environment IN ('production', 'staging', 'development')
    ),
    CONSTRAINT valid_blast_radius CHECK (
        blast_radius IS NULL OR blast_radius IN ('single_service', 'multiple_services', 'infrastructure')
    ),
    CONSTRAINT valid_reversibility CHECK (
        reversibility IS NULL OR reversibility IN ('instant', 'minutes', 'manual_only', 'irreversible')
    ),
    CONSTRAINT valid_data_impact CHECK (
        data_impact IS NULL OR data_impact IN ('none', 'read_only', 'write', 'destructive')
    ),
    CONSTRAINT valid_score_modifier CHECK (
        score_modifier >= -1.0 AND score_modifier <= 1.0
    ),
    CONSTRAINT valid_production_multiplier CHECK (
        production_multiplier >= 0 AND production_multiplier <= 3.0
    ),
    CONSTRAINT valid_incident_mode_multiplier CHECK (
        incident_mode_multiplier >= 0 AND incident_mode_multiplier <= 3.0
    ),
    CONSTRAINT valid_off_hours_multiplier CHECK (
        off_hours_multiplier >= 0 AND off_hours_multiplier <= 3.0
    ),
    CONSTRAINT valid_approval_threshold CHECK (
        require_approval_threshold IS NULL OR (require_approval_threshold >= 0 AND require_approval_threshold <= 1.0)
    ),
    CONSTRAINT valid_block_threshold CHECK (
        block_threshold IS NULL OR (block_threshold >= 0 AND block_threshold <= 1.0)
    ),
    CONSTRAINT valid_priority CHECK (priority >= 0)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_custom_risk_rules_tenant_enabled
    ON custom_risk_rules(tenant_id, enabled)
    WHERE enabled = TRUE;

CREATE INDEX IF NOT EXISTS idx_custom_risk_rules_action_types
    ON custom_risk_rules USING GIN(action_types);

CREATE INDEX IF NOT EXISTS idx_custom_risk_rules_priority
    ON custom_risk_rules(priority ASC);

-- Comments
COMMENT ON TABLE custom_risk_rules IS 'Custom risk assessment rules per tenant';
COMMENT ON COLUMN custom_risk_rules.action_types IS 'Array of action types this rule applies to (e.g., deploy, rollback)';
COMMENT ON COLUMN custom_risk_rules.score_modifier IS 'Added to base score (-1.0 to +1.0)';
COMMENT ON COLUMN custom_risk_rules.priority IS 'Lower values = higher priority, first match wins';

-- ==================== Risk Assessments (Audit Trail) ====================

-- Records every risk assessment for audit and analysis
CREATE TABLE IF NOT EXISTS risk_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,

    -- Link to action
    action_proposal_id VARCHAR(255),
    action_type VARCHAR(100) NOT NULL,

    -- Computed risk factors
    blast_radius VARCHAR(50) NOT NULL,
    reversibility VARCHAR(50) NOT NULL,
    data_impact VARCHAR(50) NOT NULL,

    -- Score breakdown
    base_score DECIMAL(5,4) NOT NULL,       -- Score after composite + scoreModifier, before context (preContextScore)
    context_adjustment DECIMAL(5,4) DEFAULT 0,  -- Adjustment from context factors
    final_score DECIMAL(5,4) NOT NULL,      -- Final computed score
    risk_level VARCHAR(20) NOT NULL,        -- 'low', 'moderate', 'high', 'critical'

    -- Context at assessment time
    environment VARCHAR(50),
    incident_mode_active BOOLEAN DEFAULT FALSE,
    is_off_hours BOOLEAN DEFAULT FALSE,

    -- Rule matching
    matched_rule_id UUID REFERENCES custom_risk_rules(id) ON DELETE SET NULL,
    matched_rule_category VARCHAR(50) NOT NULL,  -- 'custom' or built-in category

    -- Summary
    summary TEXT NOT NULL,

    -- Request tracking
    request_id VARCHAR(255),
    assessed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT valid_risk_level CHECK (
        risk_level IN ('low', 'moderate', 'high', 'critical')
    ),
    CONSTRAINT valid_scores CHECK (
        base_score >= 0 AND base_score <= 1 AND
        final_score >= 0 AND final_score <= 1
    )
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_risk_assessments_tenant_time
    ON risk_assessments(tenant_id, assessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_risk_assessments_action_proposal
    ON risk_assessments(action_proposal_id)
    WHERE action_proposal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_risk_assessments_action_type
    ON risk_assessments(action_type);

CREATE INDEX IF NOT EXISTS idx_risk_assessments_risk_level
    ON risk_assessments(risk_level)
    WHERE risk_level IN ('high', 'critical');

-- Comments
COMMENT ON TABLE risk_assessments IS 'Audit trail of all risk assessments performed';
COMMENT ON COLUMN risk_assessments.base_score IS 'Score after composite + scoreModifier, before context multipliers (preContextScore)';
COMMENT ON COLUMN risk_assessments.context_adjustment IS 'Score change from environment/incident/off-hours factors';
COMMENT ON COLUMN risk_assessments.matched_rule_id IS 'Custom rule that was applied, NULL if built-in rule';

-- ==================== Triggers ====================

-- Update timestamp trigger function (reuse if exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Apply trigger to custom_risk_rules
DROP TRIGGER IF EXISTS update_custom_risk_rules_updated_at ON custom_risk_rules;
CREATE TRIGGER update_custom_risk_rules_updated_at
    BEFORE UPDATE ON custom_risk_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
