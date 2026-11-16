/**
 * Migration 043: Add tenant_id to analysis_feedback
 *
 * WHY:
 * Multiple application code paths query analysis_feedback.tenant_id directly,
 * but the column was never added by any migration, causing the live postgres
 * error: `column "tenant_id" does not exist`. Affected callers:
 *   - services/api/src/services/feedbackStatsService.ts
 *       WHERE ($1::text IS NULL OR tenant_id = $1)
 *       WHERE created_at >= $1 AND ($2::text IS NULL OR tenant_id = $2)
 *   - services/api/src/services/finetuning/evaluationService.ts
 *       af.tenant_id = $2
 *   - packages/shared/src/constants/datasetExtractor.ts
 *       tenant_id = $3 (and selects tenant_id)
 *
 * APPROACH (safe for a live DB that already has data):
 *   1. Add the column NULLABLE so the ALTER does not rewrite/validate rows
 *      and never fails on existing data (no NOT NULL without a default).
 *   2. Add the FK to tenants(id) as a separately-guarded constraint so that
 *      re-running this file does not error on a duplicate constraint.
 *   3. Backfill tenant_id from the parent analyses row via analysis_id.
 *      Feedback rows with a NULL analysis_id (allowed — analysis_id is
 *      nullable) keep a NULL tenant_id; the queries above tolerate NULL
 *      (the `$N::text IS NULL OR tenant_id = $N` form simply won't match
 *      those rows for a specific tenant, which is correct).
 *   4. Index tenant_id (and a composite (tenant_id, created_at) to serve the
 *      time-windowed COUNT_SINCE_DATE stats query directly).
 *
 * ON DELETE CASCADE is used to match analyses.tenant_id (set in migration 030):
 * feedback is tenant-owned data and should be removed when the tenant is
 * hard-deleted, not orphaned with a dangling tenant_id.
 *
 * This file is idempotent and safe to re-run.
 */

-- 1. Add nullable column (idempotent; no inline FK so re-runs stay clean).
ALTER TABLE analysis_feedback
  ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50);

-- 2. Add FK to tenants(id) with ON DELETE CASCADE, guarded so re-runs are safe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'analysis_feedback'
      AND constraint_name = 'analysis_feedback_tenant_id_fkey'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE analysis_feedback
      ADD CONSTRAINT analysis_feedback_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3. Backfill tenant_id from the parent analysis. Rows whose analysis_id is
--    NULL (or points to an analysis with a NULL tenant_id) are left NULL.
--    Only touch rows that still need it so re-runs are cheap and idempotent.
UPDATE analysis_feedback AS af
SET tenant_id = a.tenant_id
FROM analyses AS a
WHERE af.analysis_id = a.id
  AND af.tenant_id IS NULL
  AND a.tenant_id IS NOT NULL;

-- 4. Indexes for the tenant-filtered queries above.
--    Plain tenant_id index for the simple `tenant_id = $N` filters.
CREATE INDEX IF NOT EXISTS idx_feedback_tenant_id
  ON analysis_feedback(tenant_id);

--    Composite (tenant_id, created_at) for the COUNT_SINCE_DATE query
--    (`created_at >= $1 AND tenant_id = $2`) in feedbackStatsService.
CREATE INDEX IF NOT EXISTS idx_feedback_tenant_created_at
  ON analysis_feedback(tenant_id, created_at);

COMMENT ON COLUMN analysis_feedback.tenant_id IS
  'Owning tenant, backfilled from the parent analysis. Nullable: feedback with no analysis_id has no derivable tenant.';

-- ============================================================================
-- Rollback:
--   DROP INDEX IF EXISTS idx_feedback_tenant_created_at;
--   DROP INDEX IF EXISTS idx_feedback_tenant_id;
--   ALTER TABLE analysis_feedback DROP CONSTRAINT IF EXISTS analysis_feedback_tenant_id_fkey;
--   ALTER TABLE analysis_feedback DROP COLUMN IF EXISTS tenant_id;
-- ============================================================================
