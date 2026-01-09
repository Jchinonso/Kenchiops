-- Migration: 007_model_versioning
-- Description: Create tables for AI model versioning and feature flags
-- Phase 3: RAG Fine-tuning and Feedback Loop

-- Model versions table - tracks fine-tuned model deployments
CREATE TABLE IF NOT EXISTS model_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    base_model VARCHAR(255) NOT NULL,
    fine_tuned_model_id VARCHAR(255),
    training_job_id VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    training_file_id VARCHAR(255),
    dataset_size INTEGER,
    training_epochs INTEGER,
    metrics JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT FALSE,
    is_rollback_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    activated_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT valid_status CHECK (status IN ('pending', 'training', 'succeeded', 'failed', 'cancelled'))
);

-- Model feature flags table - A/B testing and gradual rollout
CREATE TABLE IF NOT EXISTS model_feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    model_version_id UUID NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
    flag_name VARCHAR(255) NOT NULL,
    percentage INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_percentage CHECK (percentage >= 0 AND percentage <= 100),
    CONSTRAINT unique_tenant_flag UNIQUE (tenant_id, flag_name)
);

-- Indexes for model_versions
CREATE INDEX IF NOT EXISTS idx_model_versions_tenant_id ON model_versions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_model_versions_status ON model_versions(status);
CREATE INDEX IF NOT EXISTS idx_model_versions_is_active ON model_versions(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_model_versions_tenant_active ON model_versions(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_model_versions_created_at ON model_versions(created_at DESC);

-- Indexes for model_feature_flags
CREATE INDEX IF NOT EXISTS idx_model_feature_flags_tenant_id ON model_feature_flags(tenant_id);
CREATE INDEX IF NOT EXISTS idx_model_feature_flags_model_version_id ON model_feature_flags(model_version_id);
CREATE INDEX IF NOT EXISTS idx_model_feature_flags_is_active ON model_feature_flags(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_model_feature_flags_tenant_active ON model_feature_flags(tenant_id, is_active);

-- Update timestamp trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for automatic timestamp updates
DROP TRIGGER IF EXISTS update_model_versions_updated_at ON model_versions;
CREATE TRIGGER update_model_versions_updated_at
    BEFORE UPDATE ON model_versions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_model_feature_flags_updated_at ON model_feature_flags;
CREATE TRIGGER update_model_feature_flags_updated_at
    BEFORE UPDATE ON model_feature_flags
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE model_versions IS 'Tracks AI model versions including fine-tuned models and their deployment status';
COMMENT ON TABLE model_feature_flags IS 'Feature flags for A/B testing and gradual rollout of model versions';

COMMENT ON COLUMN model_versions.base_model IS 'Base OpenAI model used for fine-tuning (e.g., gpt-4o-mini-2024-07-18)';
COMMENT ON COLUMN model_versions.fine_tuned_model_id IS 'OpenAI fine-tuned model ID after training completes';
COMMENT ON COLUMN model_versions.training_job_id IS 'OpenAI fine-tuning job ID for status tracking';
COMMENT ON COLUMN model_versions.metrics IS 'Training metrics including loss, accuracy, and evaluation results';
COMMENT ON COLUMN model_versions.is_rollback_active IS 'TRUE if this version was activated due to rollback from a newer version';

COMMENT ON COLUMN model_feature_flags.percentage IS 'Percentage of traffic (0-100) to route to this model version';
COMMENT ON COLUMN model_feature_flags.metadata IS 'Additional configuration for the feature flag';
