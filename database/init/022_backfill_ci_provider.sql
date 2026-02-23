-- Migration 022: Backfill ci_provider on analyses
--
-- WHY: The ci_provider column was added in migration 017 but was never populated.
-- This migration backfills it from the linked event's source column so the dashboard
-- can filter analyses by provider.
--
-- ROLLBACK:
--   UPDATE analyses SET ci_provider = NULL;

-- Map event.source values to ci_provider values
-- "github-app" → "github_actions", "gitlab" → "gitlab_ci"
UPDATE analyses a
SET ci_provider = CASE e.source
  WHEN 'github-app' THEN 'github_actions'
  WHEN 'gitlab' THEN 'gitlab_ci'
  ELSE e.source
END
FROM events e
WHERE a.event_id = e.id
  AND a.ci_provider IS NULL;

-- For analyses without a linked event, try to infer from aggregation_key
-- (GitHub aggregation keys contain github.com-style org/repo paths)
UPDATE analyses
SET ci_provider = 'github_actions'
WHERE ci_provider IS NULL
  AND aggregation_key IS NOT NULL
  AND aggregation_key LIKE '%/%:%';
