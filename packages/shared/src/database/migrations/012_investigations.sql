-- Migration: 012_investigations
-- Description: Create table for on-demand diagnostic investigations
-- Phase: Investigation Feature (Work Package 1)

-- ==================== Investigations ====================

-- Investigations track on-demand diagnostic requests initiated by users or the system
CREATE TABLE IF NOT EXISTS investigations (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,

    -- Initiation context
    initiated_by VARCHAR(255) NOT NULL,
    initiated_from VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'queued',
    description TEXT NOT NULL,

    -- Parsed intent fields (populated after intent parsing)
    service_name VARCHAR(255),
    endpoint VARCHAR(500),
    symptom VARCHAR(100),
    environment VARCHAR(100),
    time_range_from TIMESTAMP WITH TIME ZONE,
    time_range_to TIMESTAMP WITH TIME ZONE,

    -- Pipeline results (populated progressively)
    evidence JSONB DEFAULT '[]'::jsonb,
    correlation JSONB DEFAULT '{}'::jsonb,
    diagnosis JSONB DEFAULT '{}'::jsonb,

    -- Completion metadata
    duration_ms INTEGER,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT valid_initiated_from CHECK (
        initiated_from IN ('slack', 'frontend', 'api')
    ),
    CONSTRAINT valid_status CHECK (
        status IN ('queued', 'parsing', 'gathering', 'correlating', 'diagnosing', 'completed', 'error')
    )
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_investigations_tenant_created
    ON investigations(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_investigations_status
    ON investigations(status);

CREATE INDEX IF NOT EXISTS idx_investigations_service_name
    ON investigations(service_name);

-- Comments
COMMENT ON TABLE investigations IS 'On-demand diagnostic investigations initiated by users or the system';
COMMENT ON COLUMN investigations.id IS 'Generated via generateEventId("inv") in application code';
COMMENT ON COLUMN investigations.initiated_by IS 'User ID or "system" for automated investigations';
COMMENT ON COLUMN investigations.initiated_from IS 'Channel: slack, frontend, or api';
COMMENT ON COLUMN investigations.status IS 'Pipeline stage: queued -> parsing -> gathering -> correlating -> diagnosing -> completed/error';
COMMENT ON COLUMN investigations.description IS 'Raw natural language input describing what to investigate';
COMMENT ON COLUMN investigations.evidence IS 'Collected evidence items as JSONB array';
COMMENT ON COLUMN investigations.correlation IS 'Cross-signal correlation results as JSONB object';
COMMENT ON COLUMN investigations.diagnosis IS 'Final diagnosis output as JSONB object';
COMMENT ON COLUMN investigations.duration_ms IS 'Total pipeline execution time in milliseconds';

-- ==================== Triggers ====================

-- Update timestamp trigger function (reuse if exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Apply trigger to investigations
DROP TRIGGER IF EXISTS update_investigations_updated_at ON investigations;
CREATE TRIGGER update_investigations_updated_at
    BEFORE UPDATE ON investigations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
