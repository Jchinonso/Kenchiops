-- Incident Triage Tables
-- Stores incoming alerts from monitoring sources and their triage results.

-- ==================== Incident Alerts ====================

CREATE TABLE IF NOT EXISTS incident_alerts (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) REFERENCES tenants(id) ON DELETE SET NULL,
    source VARCHAR(50) NOT NULL,
    source_alert_id VARCHAR(255) NOT NULL,
    delivery_id VARCHAR(255) NOT NULL,
    fingerprint VARCHAR(255),
    title TEXT NOT NULL,
    description TEXT,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium',
    status VARCHAR(50) NOT NULL DEFAULT 'received',
    service_name VARCHAR(255),
    environment VARCHAR(50),
    metrics JSONB DEFAULT '{}',
    labels JSONB DEFAULT '{}',
    source_payload JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_alerts_tenant_created
    ON incident_alerts(tenant_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_incident_alerts_delivery_id
    ON incident_alerts(delivery_id);
CREATE INDEX IF NOT EXISTS idx_incident_alerts_fingerprint
    ON incident_alerts(fingerprint);
CREATE INDEX IF NOT EXISTS idx_incident_alerts_status
    ON incident_alerts(status);

-- ==================== Incident Triage Results ====================

CREATE TABLE IF NOT EXISTS incident_triage_results (
    id VARCHAR(50) PRIMARY KEY,
    alert_id VARCHAR(50) NOT NULL REFERENCES incident_alerts(id) ON DELETE CASCADE,
    tenant_id VARCHAR(50) REFERENCES tenants(id) ON DELETE SET NULL,
    severity_score NUMERIC(5,2),
    severity_label VARCHAR(20),
    severity_factors JSONB DEFAULT '[]',
    confidence NUMERIC(5,4),
    completeness NUMERIC(5,4),
    missing_fields TEXT[] DEFAULT '{}',
    matched_runbooks JSONB DEFAULT '[]',
    correlated_incidents JSONB DEFAULT '[]',
    evidence_catalog JSONB DEFAULT '{}',
    ai_summary JSONB,
    summary_source VARCHAR(20) DEFAULT 'pending',
    routing_decision JSONB,
    dispatched_to JSONB DEFAULT '[]',
    pipeline_duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_triage_results_alert_id
    ON incident_triage_results(alert_id);
CREATE INDEX IF NOT EXISTS idx_incident_triage_results_tenant_created
    ON incident_triage_results(tenant_id, created_at DESC);

-- ==================== Incident Dedup Window ====================

CREATE TABLE IF NOT EXISTS incident_dedup_window (
    fingerprint VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(50),
    alert_id VARCHAR(50) NOT NULL REFERENCES incident_alerts(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (fingerprint, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_incident_dedup_window_expires_at
    ON incident_dedup_window(expires_at);
