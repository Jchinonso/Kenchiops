/**
 * Migration 030: Fix orphaned data cascading
 *
 * Changes tenant_id foreign key constraints from ON DELETE SET NULL
 * to ON DELETE CASCADE for tables that represent tenant-owned data.
 * This ensures that when a tenant is hard-deleted, all associated
 * data is properly cleaned up instead of being orphaned with NULL tenant_id.
 *
 * Tables affected:
 * - events.tenant_id → CASCADE (events belong to tenants)
 * - analyses.tenant_id → CASCADE (analyses belong to tenants)
 * - slack_messages.tenant_id → CASCADE (messages belong to tenants) [added in 002]
 * - incident_alerts.tenant_id → CASCADE (alerts belong to tenants)
 * - incident_triage_results.tenant_id → CASCADE (triage results belong to tenants)
 * - webhook_activity.tenant_id → CASCADE (activity logs belong to tenants)
 *
 * NOT changed (SET NULL is correct):
 * - users.selected_tenant_id → SET NULL (user preference, not ownership)
 * - knowledge_documents.external_source_id → SET NULL (content reference)
 * - rag_feedback.knowledge_doc_id → SET NULL (feedback survives doc deletion)
 * - analyses.model_version_id → SET NULL (analysis survives model archival)
 * - slack_messages.analysis_id → SET NULL (message survives analysis deletion)
 */

-- events.tenant_id: DROP old constraint, ADD new with CASCADE
DO $$
BEGIN
  -- Find and drop the existing FK constraint on events.tenant_id
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'events'
      AND kcu.column_name = 'tenant_id'
      AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE events DROP CONSTRAINT ' || tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'events'
        AND kcu.column_name = 'tenant_id'
        AND tc.constraint_type = 'FOREIGN KEY'
      LIMIT 1
    );
  END IF;
END $$;

ALTER TABLE events
  ADD CONSTRAINT events_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- analyses.tenant_id: DROP old constraint, ADD new with CASCADE
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'analyses'
      AND kcu.column_name = 'tenant_id'
      AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE analyses DROP CONSTRAINT ' || tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'analyses'
        AND kcu.column_name = 'tenant_id'
        AND tc.constraint_type = 'FOREIGN KEY'
      LIMIT 1
    );
  END IF;
END $$;

ALTER TABLE analyses
  ADD CONSTRAINT analyses_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- incident_alerts.tenant_id: DROP old constraint, ADD new with CASCADE
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'incident_alerts'
      AND kcu.column_name = 'tenant_id'
      AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE incident_alerts DROP CONSTRAINT ' || tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'incident_alerts'
        AND kcu.column_name = 'tenant_id'
        AND tc.constraint_type = 'FOREIGN KEY'
      LIMIT 1
    );
  END IF;
END $$;

ALTER TABLE incident_alerts
  ADD CONSTRAINT incident_alerts_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- incident_triage_results.tenant_id: DROP old constraint, ADD new with CASCADE
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'incident_triage_results'
      AND kcu.column_name = 'tenant_id'
      AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE incident_triage_results DROP CONSTRAINT ' || tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'incident_triage_results'
        AND kcu.column_name = 'tenant_id'
        AND tc.constraint_type = 'FOREIGN KEY'
      LIMIT 1
    );
  END IF;
END $$;

ALTER TABLE incident_triage_results
  ADD CONSTRAINT incident_triage_results_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- webhook_activity.tenant_id: DROP old constraint, ADD new with CASCADE
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'webhook_activity'
      AND kcu.column_name = 'tenant_id'
      AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE webhook_activity DROP CONSTRAINT ' || tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'webhook_activity'
        AND kcu.column_name = 'tenant_id'
        AND tc.constraint_type = 'FOREIGN KEY'
      LIMIT 1
    );
  END IF;
END $$;

ALTER TABLE webhook_activity
  ADD CONSTRAINT webhook_activity_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
