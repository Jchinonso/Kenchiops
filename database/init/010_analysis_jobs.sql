-- Analysis Jobs table
-- Tracks async CI failure analysis requests processed by the analysis worker.
-- Jobs are inserted via POST /api/analyze and polled via GET /api/jobs/:id.

CREATE TABLE IF NOT EXISTS analysis_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(100),
    workspace_id VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    log_ref JSONB,
    repository_full_name VARCHAR(255),
    commit_sha VARCHAR(40),
    installation_id INTEGER,
    result JSONB,
    error TEXT,
    analysis_enqueued_at TIMESTAMPTZ,
    processing_started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status ON analysis_jobs(status);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_created_at ON analysis_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_idempotency ON analysis_jobs(idempotency_key);
