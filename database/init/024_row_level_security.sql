-- Migration 024: Row-Level Security (RLS) for Multi-Tenant Isolation
--
-- WHY: All tenant isolation is currently enforced at the application layer only.
-- A single bug in any query can leak cross-tenant data. RLS adds a database-level
-- safety net that prevents cross-tenant reads/writes regardless of application bugs.
--
-- IMPORTANT PREREQUISITES:
--   - The application database user must NOT be a superuser (superusers bypass RLS)
--   - Migration scripts and admin tools should use a separate superuser connection
--   - Application must use SET LOCAL (transaction-scoped) via withTenantContext()
--
-- ROLLOUT STRATEGY:
--   Phase 1 (this migration): Enable RLS with BOTH restrictive and permissive policies.
--     The permissive "audit_allow_all" policy ensures no queries break while we verify
--     that the application correctly sets app.tenant_id on every transaction.
--   Phase 2 (future migration): Drop the permissive "audit_allow_all" policies after
--     1-2 weeks of zero mismatches in production logs.
--
-- ROLLBACK:
--   Run the DO block at the bottom of this file (commented out) to disable RLS
--   and drop all policies created here.

-- ==================== Step 1: Tenant Context Function ====================
-- Returns the current tenant_id from the session-local variable.
-- Returns NULL if unset, which means "deny all" since no row has tenant_id = NULL
-- (all tenant_id columns are NOT NULL or reference tenants(id)).
-- Uses NULLIF to treat empty string as NULL (secure default).

CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS VARCHAR(50) AS $$
BEGIN
  RETURN NULLIF(current_setting('app.tenant_id', true), '');
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;  -- Secure default: no tenant_id set = deny all rows
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION current_tenant_id() IS
  'Returns the current tenant_id from session-local settings (app.tenant_id). '
  'Returns NULL if unset, which acts as deny-all since no rows match NULL.';

-- ==================== Step 2: Enable RLS on All Tenant-Scoped Tables ====================
-- This block enables RLS, forces it for table owners, creates a restrictive policy
-- for real tenant isolation, and a permissive audit-mode policy for safe rollout.
--
-- Tables included: every table in the schema that has a tenant_id column.
-- Tables NOT in this list either:
--   (a) don't have tenant_id (plans, flake_records, oauth_states, etc.)
--   (b) don't exist yet (the remediation plan references some future tables)
--
-- NOTE: Some tables listed in the remediation plan don't exist under those names:
--   - "webhook_activity_log" -> actual table is "webhook_activity"
--   - "ci_connections" -> actual table is "provider_connections"
--   - "rag_feedback" -> actual table is "analysis_feedback" (no tenant_id yet)
--   - "investigations", "custom_risk_rules", "risk_assessments" -> do not exist
--
-- Tables where tenant_id exists but is nullable (events, analyses, slack_messages,
-- incident_alerts, incident_triage_results, webhook_activity): the policy uses
-- tenant_id = current_tenant_id() which correctly handles NULLs (NULL != anything
-- returns false, denying access to orphaned rows without a tenant).

DO $$
DECLARE
  tbl TEXT;
  -- All tables that currently have a tenant_id column in the schema.
  -- Verified against migrations 001-023.
  tenant_tables TEXT[] := ARRAY[
    'analyses',
    'events',
    'incident_alerts',
    'incident_triage_results',
    'tenant_audit_log',
    'knowledge_documents',
    'diff_chunks',
    'external_sources',
    'rag_test_cases',
    'repository_channel_mappings',
    'user_organizations',
    'webhook_activity',
    'provider_connections',
    'slack_messages',
    'rag_cost_tracking',
    'rag_metrics_history',
    'incident_dedup_window'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables LOOP
    -- Skip tables that don't exist (defensive for partial schema states)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      RAISE NOTICE 'Skipping RLS for non-existent table: %', tbl;
      CONTINUE;
    END IF;

    -- Enable RLS on the table
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);

    -- FORCE RLS so even the table owner (the app user) obeys policies.
    -- Without this, the table owner bypasses RLS entirely.
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);

    -- Create the restrictive tenant isolation policy.
    -- USING: controls which rows are visible (SELECT, UPDATE, DELETE)
    -- WITH CHECK: controls which rows can be inserted or updated to
    -- Both must match the current tenant context.
    -- IF NOT EXISTS is not supported for CREATE POLICY, so we drop first.
    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_isolation ON %I',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL '
      'USING (tenant_id = current_tenant_id()) '
      'WITH CHECK (tenant_id = current_tenant_id())',
      tbl
    );

    -- Create a permissive audit-mode policy for safe rollout.
    -- This allows ALL access regardless of tenant_id, ensuring no queries break
    -- while we verify the application correctly sets app.tenant_id everywhere.
    -- DROP THIS POLICY in a future migration after audit period confirms no mismatches.
    EXECUTE format(
      'DROP POLICY IF EXISTS audit_allow_all ON %I',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY audit_allow_all ON %I FOR ALL '
      'USING (true) '
      'WITH CHECK (true)',
      tbl
    );

    RAISE NOTICE 'RLS enabled on table: % (with audit_allow_all)', tbl;
  END LOOP;
END $$;

-- ==================== Comments ====================

COMMENT ON POLICY tenant_isolation ON analyses IS
  'Restricts row access to rows matching the current session tenant_id';
COMMENT ON POLICY audit_allow_all ON analyses IS
  'Temporary permissive policy for audit-mode rollout. Remove after verifying all queries set app.tenant_id.';

-- ==================== ROLLBACK (run manually if needed) ====================
-- To reverse this migration, run:
--
-- DO $$
-- DECLARE
--   tbl TEXT;
--   tenant_tables TEXT[] := ARRAY[
--     'analyses', 'events', 'incident_alerts', 'incident_triage_results',
--     'tenant_audit_log', 'knowledge_documents', 'diff_chunks',
--     'external_sources', 'rag_test_cases', 'repository_channel_mappings',
--     'user_organizations', 'webhook_activity', 'provider_connections',
--     'slack_messages', 'rag_cost_tracking', 'rag_metrics_history',
--     'incident_dedup_window'
--   ];
-- BEGIN
--   FOREACH tbl IN ARRAY tenant_tables LOOP
--     IF EXISTS (
--       SELECT 1 FROM information_schema.tables
--       WHERE table_schema = 'public' AND table_name = tbl
--     ) THEN
--       EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
--       EXECUTE format('DROP POLICY IF EXISTS audit_allow_all ON %I', tbl);
--       EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', tbl);
--       EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', tbl);
--     END IF;
--   END LOOP;
-- END $$;
--
-- DROP FUNCTION IF EXISTS current_tenant_id();
