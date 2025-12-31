-- Migration: Model Versioning Tables
-- Description: Creates tables for model version management, A/B testing, and rollback support
-- Part of Phase 3: RAG Fine-Tuning & Feedback Loop

-- ==================== Model Versions ====================
-- Stores information about each fine-tuned model version

CREATE TABLE IF NOT EXISTS model_versions (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    model_id VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_baseline BOOLEAN NOT NULL DEFAULT FALSE,

    -- Training metadata
    training_dataset_id VARCHAR(255),
    training_examples_count INTEGER,
    parent_model_id VARCHAR(255),

    -- Evaluation metrics
    accuracy DECIMAL(5,4),
    helpful_rate DECIMAL(5,4),
    recall_at_5 DECIMAL(5,4),
    mrr DECIMAL(5,4),
    human_review_score DECIMAL(5,4),

    -- Timestamps
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster baseline lookup
CREATE INDEX IF NOT EXISTS idx_model_versions_is_baseline ON model_versions(is_baseline);

-- Index for listing by creation date
CREATE INDEX IF NOT EXISTS idx_model_versions_created_at ON model_versions(created_at DESC);

-- ==================== Model Feature Flags ====================
-- Stores feature flag configuration for model selection, A/B testing, and rollback

CREATE TABLE IF NOT EXISTS model_feature_flags (
    id VARCHAR(36) PRIMARY KEY,

    -- Default model configuration
    default_model_version VARCHAR(36) NOT NULL,

    -- Rollback configuration
    rollback_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    rollback_model_version VARCHAR(36) NOT NULL,
    rollback_active BOOLEAN NOT NULL DEFAULT FALSE,

    -- A/B test configuration
    ab_test_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ab_test_control_version VARCHAR(36),
    ab_test_treatment_version VARCHAR(36),
    ab_test_treatment_percentage INTEGER CHECK (ab_test_treatment_percentage >= 0 AND ab_test_treatment_percentage <= 100),
    ab_test_started_at TIMESTAMPTZ,
    ab_test_end_at TIMESTAMPTZ,

    -- Tenant-specific overrides (JSONB for flexibility)
    tenant_overrides JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== Seed Baseline Model ====================
-- Insert the default baseline model version

INSERT INTO model_versions (
    id,
    name,
    model_id,
    description,
    created_at,
    is_baseline
) VALUES (
    'base_v1',
    'Base Model',
    'gpt-4o-mini',
    'Default baseline model for CI failure analysis',
    NOW(),
    TRUE
) ON CONFLICT (id) DO NOTHING;

-- ==================== Seed Default Feature Flags ====================
-- Insert default feature flag configuration

INSERT INTO model_feature_flags (
    id,
    default_model_version,
    rollback_enabled,
    rollback_model_version,
    rollback_active,
    ab_test_enabled,
    tenant_overrides
) VALUES (
    'default',
    'base_v1',
    TRUE,
    'base_v1',
    FALSE,
    FALSE,
    '{}'
) ON CONFLICT (id) DO NOTHING;

-- ==================== Add Comments ====================
COMMENT ON TABLE model_versions IS 'Stores fine-tuned model versions with training metadata and evaluation metrics';
COMMENT ON TABLE model_feature_flags IS 'Stores feature flags for model selection, A/B testing, and rollback configuration';

COMMENT ON COLUMN model_versions.is_baseline IS 'Whether this is the baseline model that cannot be deleted';
COMMENT ON COLUMN model_versions.training_dataset_id IS 'Reference to the training dataset used';
COMMENT ON COLUMN model_versions.training_examples_count IS 'Number of examples used for training';
COMMENT ON COLUMN model_versions.parent_model_id IS 'Model version ID this was fine-tuned from';
COMMENT ON COLUMN model_versions.accuracy IS 'Accuracy metric from evaluation (0-1)';
COMMENT ON COLUMN model_versions.helpful_rate IS 'Rate of helpful responses from evaluation (0-1)';
COMMENT ON COLUMN model_versions.recall_at_5 IS 'Recall@5 metric for RAG retrieval (0-1)';
COMMENT ON COLUMN model_versions.mrr IS 'Mean Reciprocal Rank metric (0-1)';
COMMENT ON COLUMN model_versions.human_review_score IS 'Average human review score (0-1)';

COMMENT ON COLUMN model_feature_flags.default_model_version IS 'Default model version to use when no overrides apply';
COMMENT ON COLUMN model_feature_flags.rollback_enabled IS 'Whether automatic rollback is enabled';
COMMENT ON COLUMN model_feature_flags.rollback_model_version IS 'Model version to rollback to when triggered';
COMMENT ON COLUMN model_feature_flags.rollback_active IS 'Whether rollback is currently active';
COMMENT ON COLUMN model_feature_flags.ab_test_enabled IS 'Whether A/B testing is currently active';
COMMENT ON COLUMN model_feature_flags.ab_test_treatment_percentage IS 'Percentage of traffic to route to treatment (0-100)';
COMMENT ON COLUMN model_feature_flags.tenant_overrides IS 'JSONB map of tenant_id to model_version_id for per-tenant overrides';
