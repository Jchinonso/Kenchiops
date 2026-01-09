-- Migration: 008_fix_model_versioning_schema
-- Description: Align model versioning tables with repository code expectations
-- Fixes schema mismatch between 007_model_versioning and modelVersionRepository.ts

-- ============================================================
-- PART 1: Fix model_versions table to match repository schema
-- ============================================================

-- Drop existing constraints if any
ALTER TABLE model_versions DROP CONSTRAINT IF EXISTS valid_status;

-- Add missing columns needed by repository
ALTER TABLE model_versions ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE model_versions ADD COLUMN IF NOT EXISTS model_id VARCHAR(255);
ALTER TABLE model_versions ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE model_versions ADD COLUMN IF NOT EXISTS is_baseline BOOLEAN DEFAULT FALSE;
ALTER TABLE model_versions ADD COLUMN IF NOT EXISTS training_dataset_id VARCHAR(255);
ALTER TABLE model_versions ADD COLUMN IF NOT EXISTS training_examples_count INTEGER;
ALTER TABLE model_versions ADD COLUMN IF NOT EXISTS parent_model_id VARCHAR(255);

-- Add evaluation metric columns
ALTER TABLE model_versions ADD COLUMN IF NOT EXISTS accuracy DECIMAL(5,4);
ALTER TABLE model_versions ADD COLUMN IF NOT EXISTS helpful_rate DECIMAL(5,4);
ALTER TABLE model_versions ADD COLUMN IF NOT EXISTS recall_at_5 DECIMAL(5,4);
ALTER TABLE model_versions ADD COLUMN IF NOT EXISTS mrr DECIMAL(5,4);
ALTER TABLE model_versions ADD COLUMN IF NOT EXISTS human_review_score DECIMAL(5,4);

-- Migrate data from old columns to new columns
UPDATE model_versions
SET
  name = COALESCE(name, 'Model ' || id::text),
  model_id = COALESCE(model_id, fine_tuned_model_id, base_model),
  is_baseline = COALESCE(is_baseline, FALSE)
WHERE name IS NULL OR model_id IS NULL;

-- Make id column accept text (for compatibility with generateEventId)
-- First, drop the default and recreate as VARCHAR
ALTER TABLE model_versions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE model_versions ALTER COLUMN id TYPE VARCHAR(255) USING id::text;

-- Remove tenant requirement (global model versions)
ALTER TABLE model_versions ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE model_versions ALTER COLUMN base_model DROP NOT NULL;

-- Index for baseline lookup
CREATE INDEX IF NOT EXISTS idx_model_versions_is_baseline ON model_versions(is_baseline) WHERE is_baseline = TRUE;

-- ============================================================
-- PART 2: Recreate feature flags table for singleton design
-- ============================================================

-- Drop the old feature flags table and create new one
DROP TABLE IF EXISTS model_feature_flags CASCADE;

CREATE TABLE model_feature_flags (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
    default_model_version VARCHAR(255) NOT NULL,
    rollback_enabled BOOLEAN DEFAULT TRUE,
    rollback_model_version VARCHAR(255) NOT NULL,
    ab_test_enabled BOOLEAN DEFAULT FALSE,
    ab_test_control_version VARCHAR(255),
    ab_test_treatment_version VARCHAR(255),
    ab_test_treatment_percentage INTEGER,
    ab_test_started_at TIMESTAMP WITH TIME ZONE,
    ab_test_end_at TIMESTAMP WITH TIME ZONE,
    tenant_overrides JSONB DEFAULT '{}',
    rollback_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_ab_test_percentage CHECK (
        ab_test_treatment_percentage IS NULL OR
        (ab_test_treatment_percentage >= 0 AND ab_test_treatment_percentage <= 100)
    )
);

-- Insert default feature flags
INSERT INTO model_feature_flags (
    id,
    default_model_version,
    rollback_model_version,
    rollback_enabled,
    ab_test_enabled,
    rollback_active
) VALUES (
    'default',
    'base_v1',
    'base_v1',
    TRUE,
    FALSE,
    FALSE
) ON CONFLICT (id) DO NOTHING;

-- Trigger for auto-update timestamp
DROP TRIGGER IF EXISTS update_model_feature_flags_updated_at ON model_feature_flags;
CREATE TRIGGER update_model_feature_flags_updated_at
    BEFORE UPDATE ON model_feature_flags
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- PART 3: Add model_version_id to analyses table
-- ============================================================

-- Add column to track which model version was used for analysis
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS model_version_id VARCHAR(255);

-- Index for model version queries
CREATE INDEX IF NOT EXISTS idx_analyses_model_version_id ON analyses(model_version_id);

-- ============================================================
-- PART 4: Create baseline model version if not exists
-- ============================================================

INSERT INTO model_versions (
    id,
    name,
    model_id,
    description,
    created_at,
    is_baseline,
    tenant_id,
    base_model,
    status
) VALUES (
    'base_v1',
    'Base Model',
    'gpt-4o-mini-2024-07-18',
    'Default OpenAI model without fine-tuning',
    '2024-01-01T00:00:00Z',
    TRUE,
    NULL,
    'gpt-4o-mini-2024-07-18',
    'succeeded'
) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Comments for documentation
-- ============================================================

COMMENT ON COLUMN model_versions.name IS 'Human-readable name for the model version';
COMMENT ON COLUMN model_versions.model_id IS 'OpenAI model ID (base or fine-tuned)';
COMMENT ON COLUMN model_versions.is_baseline IS 'TRUE for the default baseline model';
COMMENT ON COLUMN model_versions.training_dataset_id IS 'OpenAI training file ID used for fine-tuning';
COMMENT ON COLUMN model_versions.training_examples_count IS 'Number of training examples used';
COMMENT ON COLUMN model_versions.parent_model_id IS 'ID of the model this was fine-tuned from';
COMMENT ON COLUMN model_versions.accuracy IS 'Evaluation accuracy metric (0-1)';
COMMENT ON COLUMN model_versions.helpful_rate IS 'Rate of helpful feedback (0-1)';
COMMENT ON COLUMN model_versions.recall_at_5 IS 'RAG recall at 5 metric';
COMMENT ON COLUMN model_versions.mrr IS 'Mean reciprocal rank metric';
COMMENT ON COLUMN model_versions.human_review_score IS 'Human review quality score (0-1)';

COMMENT ON TABLE model_feature_flags IS 'Singleton table for model deployment configuration';
COMMENT ON COLUMN model_feature_flags.default_model_version IS 'Model version ID to use by default';
COMMENT ON COLUMN model_feature_flags.rollback_model_version IS 'Model version ID to use when rollback is triggered';
COMMENT ON COLUMN model_feature_flags.rollback_active IS 'TRUE when system is in rollback state';
COMMENT ON COLUMN model_feature_flags.tenant_overrides IS 'JSON map of tenant_id to model_version_id for tenant-specific models';

COMMENT ON COLUMN analyses.model_version_id IS 'Model version ID used to generate this analysis';
