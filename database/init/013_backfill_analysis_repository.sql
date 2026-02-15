-- Migration 013: Backfill repository data in analyses table
--
-- Context: Analyses created before the aggregation_key forward fix have:
--   - aggregation_key = NULL
--   - full_analysis JSONB without a 'repository' key
--
-- This migration:
--   1. Backfills aggregation_key from analysis_jobs where we can match
--      via summary text + timestamp proximity (within 60 seconds).
--   2. Embeds 'repository' into full_analysis JSONB for matched records.
--   3. Adds an index on aggregation_key for failure-to-analysis linking.
--
-- Idempotent: Only updates rows WHERE aggregation_key IS NULL.

-- Step 1: Backfill aggregation_key from analysis_jobs
-- Matches analyses to completed jobs using summary text + close creation timestamps.
-- DISTINCT ON ensures each analysis gets at most one match (closest in time).
UPDATE analyses a
SET aggregation_key = matched.repo,
    full_analysis = a.full_analysis || jsonb_build_object('repository', matched.repo)
FROM (
  SELECT DISTINCT ON (a2.id)
    a2.id AS analysis_id,
    j.repository_full_name AS repo
  FROM analyses a2
  JOIN analysis_jobs j ON j.status = 'completed'
    AND j.repository_full_name IS NOT NULL
    AND j.result->>'analysis' = a2.summary
    AND ABS(EXTRACT(EPOCH FROM (a2.created_at - j.completed_at))) < 60
  WHERE a2.aggregation_key IS NULL
  ORDER BY a2.id, ABS(EXTRACT(EPOCH FROM (a2.created_at - j.completed_at)))
) matched
WHERE a.id = matched.analysis_id
  AND a.aggregation_key IS NULL;

-- Step 2: For analyses that already have aggregation_key but missing repository in JSONB,
-- extract repo from the aggregation_key and embed it.
UPDATE analyses
SET full_analysis = full_analysis || jsonb_build_object(
  'repository',
  CASE
    WHEN position(':' IN aggregation_key) > 0
      THEN substring(aggregation_key FROM 1 FOR position(':' IN aggregation_key) - 1)
    ELSE aggregation_key
  END
)
WHERE aggregation_key IS NOT NULL
  AND full_analysis->>'repository' IS NULL;

-- Step 3: Add index on aggregation_key for failure-to-analysis linking (Feature 2).
-- Partial index to skip NULL keys (most benefit for non-NULL lookups).
CREATE INDEX IF NOT EXISTS idx_analyses_aggregation_key
  ON analyses(aggregation_key)
  WHERE aggregation_key IS NOT NULL;
