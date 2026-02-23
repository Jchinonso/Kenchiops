-- Migration: Add embedding vector column to incident_triage_results
-- Phase 3: Enables vector similarity search for incident correlation

ALTER TABLE incident_triage_results
  ADD COLUMN IF NOT EXISTS alert_embedding vector(1536);

CREATE INDEX IF NOT EXISTS idx_triage_embedding
  ON incident_triage_results USING ivfflat (alert_embedding vector_cosine_ops) WITH (lists = 100);
