-- Add model_version_id and aggregation_key columns to analyses table
-- These columns were missing from the original schema and are required by:
--   - model_version_id: Links analyses to the model version used for the analysis
--   - aggregation_key: Repository-based key for grouping analyses (e.g., "owner/repo:workflow")

ALTER TABLE analyses ADD COLUMN IF NOT EXISTS model_version_id VARCHAR(36) REFERENCES model_versions(id) ON DELETE SET NULL;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS aggregation_key VARCHAR(500);

CREATE INDEX IF NOT EXISTS idx_analyses_model_version ON analyses(model_version_id);
CREATE INDEX IF NOT EXISTS idx_analyses_aggregation_key ON analyses(aggregation_key) WHERE aggregation_key IS NOT NULL;
