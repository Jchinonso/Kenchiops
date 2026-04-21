-- 042_postmortems.sql
-- Postmortem drafts generated from resolved incidents.
-- content JSONB stores structured sections: summary, timeline, rootCause, impact, actionItems, lessonsLearned, additionalNotes.

CREATE TABLE IF NOT EXISTS postmortems (
  id VARCHAR(50) PRIMARY KEY DEFAULT 'pst_' || replace(gen_random_uuid()::text, '-', ''),
  tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
  alert_id VARCHAR(50) REFERENCES incident_alerts(id),
  title VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  content JSONB NOT NULL DEFAULT '{}',
  created_by VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_postmortems_tenant ON postmortems(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_postmortems_alert ON postmortems(alert_id);
