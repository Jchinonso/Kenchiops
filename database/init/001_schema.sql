-- Kenchi Database Schema
-- This script initializes the database with all required tables for the Kenchi DevOps Assistant

-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable UUID extension for generating IDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==================== Core Tables ====================

-- Events table: Stores all incoming webhook events
CREATE TABLE events (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'evt_' || replace(uuid_generate_v4()::text, '-', ''),
    type VARCHAR(50) NOT NULL,
    source VARCHAR(100) NOT NULL,
    severity VARCHAR(20),
    timestamp TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_source ON events(source);
CREATE INDEX idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX idx_events_created_at ON events(created_at DESC);

-- Analyses table: Stores LLM analysis results
CREATE TABLE analyses (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'ana_' || replace(uuid_generate_v4()::text, '-', ''),
    event_id VARCHAR(50) REFERENCES events(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    identified_cause TEXT,
    diagnosis_confidence FLOAT NOT NULL,
    action_confidence FLOAT,
    confidence_signals JSONB,
    recommended_actions JSONB,
    full_analysis JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_analyses_event_id ON analyses(event_id);
CREATE INDEX idx_analyses_created_at ON analyses(created_at DESC);
CREATE INDEX idx_analyses_confidence ON analyses(diagnosis_confidence DESC);

-- Action proposals table: Stores proposed actions and their approval status
CREATE TABLE action_proposals (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'act_' || replace(uuid_generate_v4()::text, '-', ''),
    analysis_id VARCHAR(50) REFERENCES analyses(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL,
    action_payload JSONB NOT NULL,
    diagnosis_confidence FLOAT NOT NULL,
    action_confidence FLOAT NOT NULL,
    risk_factors JSONB NOT NULL,
    decision VARCHAR(20) NOT NULL CHECK (decision IN ('auto_act', 'recommend', 'block', 'ask_question')),
    status VARCHAR(20) DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected', 'executed', 'failed')),
    approved_by VARCHAR(100),
    approved_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    execution_result JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_action_proposals_analysis_id ON action_proposals(analysis_id);
CREATE INDEX idx_action_proposals_status ON action_proposals(status);
CREATE INDEX idx_action_proposals_created_at ON action_proposals(created_at DESC);

-- ==================== Flakiness Tracking ====================

-- Flake records table: Tracks test flakiness for fingerprinting
CREATE TABLE flake_records (
    fingerprint VARCHAR(32) PRIMARY KEY,
    repository VARCHAR(200) NOT NULL,
    test_name TEXT NOT NULL,
    exception_type VARCHAR(200),
    step_name VARCHAR(200),
    occurrences INTEGER NOT NULL DEFAULT 1,
    passes_after_rerun INTEGER NOT NULL DEFAULT 0,
    flake_probability FLOAT NOT NULL DEFAULT 0,
    last_seen TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_flake_records_repo ON flake_records(repository);
CREATE INDEX idx_flake_records_probability ON flake_records(flake_probability DESC);
CREATE INDEX idx_flake_records_last_seen ON flake_records(last_seen DESC);

-- ==================== RAG / Vector Storage ====================

-- Diff chunks table: Stores code diff chunks with vector embeddings
CREATE TABLE diff_chunks (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'chk_' || replace(uuid_generate_v4()::text, '-', ''),
    repository VARCHAR(200) NOT NULL,
    pr_number INTEGER,
    commit_sha VARCHAR(40) NOT NULL,
    file_path TEXT NOT NULL,
    hunk_header TEXT,
    content TEXT NOT NULL,
    embedding vector(1536), -- OpenAI text-embedding-3-small dimension
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_diff_chunks_repo ON diff_chunks(repository);
CREATE INDEX idx_diff_chunks_commit ON diff_chunks(commit_sha);
CREATE INDEX idx_diff_chunks_pr ON diff_chunks(pr_number);
CREATE INDEX idx_diff_chunks_created_at ON diff_chunks(created_at DESC);

-- Create IVFFlat index for vector similarity search
-- Note: This index is created after some data is inserted for optimal performance
-- CREATE INDEX idx_diff_chunks_embedding ON diff_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Knowledge documents table: Stores runbooks, post-mortems, and other documentation
CREATE TABLE knowledge_documents (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'doc_' || replace(uuid_generate_v4()::text, '-', ''),
    repository VARCHAR(200),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    doc_type VARCHAR(50) NOT NULL CHECK (doc_type IN ('runbook', 'postmortem', 'documentation', 'readme', 'changelog')),
    embedding vector(1536),
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_docs_repo ON knowledge_documents(repository);
CREATE INDEX idx_knowledge_docs_type ON knowledge_documents(doc_type);

-- ==================== Feedback & Learning ====================

-- Analysis feedback table: Stores user feedback for model improvement
CREATE TABLE analysis_feedback (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'fb_' || replace(uuid_generate_v4()::text, '-', ''),
    analysis_id VARCHAR(50) REFERENCES analyses(id) ON DELETE CASCADE,
    feedback_type VARCHAR(20) NOT NULL CHECK (feedback_type IN ('correct', 'incorrect', 'flaky', 'needs_more_context')),
    correction TEXT,
    user_id VARCHAR(100) NOT NULL,
    slack_channel VARCHAR(100),
    slack_message_ts VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feedback_analysis_id ON analysis_feedback(analysis_id);
CREATE INDEX idx_feedback_type ON analysis_feedback(feedback_type);
CREATE INDEX idx_feedback_user_id ON analysis_feedback(user_id);

-- ==================== Installation Settings ====================

-- Customer/installation privacy settings
CREATE TABLE installation_settings (
    installation_id VARCHAR(50) PRIMARY KEY,
    organization_name VARCHAR(200),
    privacy_settings JSONB NOT NULL DEFAULT '{
        "redact_file_contents": false,
        "redact_commit_messages": false,
        "redact_pr_descriptions": false,
        "allow_source_fetching": true,
        "allow_diff_storage": true
    }'::jsonb,
    notification_settings JSONB NOT NULL DEFAULT '{
        "slack_channel": null,
        "notify_on_analysis": true,
        "notify_on_action_required": true,
        "notify_on_auto_action": true
    }'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== Slack Message Tracking ====================

-- Tracks Slack messages for interactive updates
CREATE TABLE slack_messages (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'msg_' || replace(uuid_generate_v4()::text, '-', ''),
    event_id VARCHAR(50) REFERENCES events(id) ON DELETE CASCADE,
    analysis_id VARCHAR(50) REFERENCES analyses(id) ON DELETE SET NULL,
    channel_id VARCHAR(50) NOT NULL,
    message_ts VARCHAR(50) NOT NULL,
    thread_ts VARCHAR(50),
    message_type VARCHAR(50) NOT NULL CHECK (message_type IN ('analysis', 'action_request', 'action_result', 'feedback_request')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_slack_messages_channel_ts ON slack_messages(channel_id, message_ts);
CREATE INDEX idx_slack_messages_event_id ON slack_messages(event_id);
CREATE INDEX idx_slack_messages_analysis_id ON slack_messages(analysis_id);

-- ==================== Helper Functions ====================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_knowledge_documents_updated_at
    BEFORE UPDATE ON knowledge_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_installation_settings_updated_at
    BEFORE UPDATE ON installation_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_slack_messages_updated_at
    BEFORE UPDATE ON slack_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==================== Comments ====================

COMMENT ON TABLE events IS 'Stores all incoming webhook events from GitHub, Slack, etc.';
COMMENT ON TABLE analyses IS 'Stores LLM analysis results for events';
COMMENT ON TABLE action_proposals IS 'Stores proposed actions and their approval/execution status';
COMMENT ON TABLE flake_records IS 'Tracks test flakiness using failure fingerprinting';
COMMENT ON TABLE diff_chunks IS 'Stores code diff chunks with vector embeddings for RAG';
COMMENT ON TABLE knowledge_documents IS 'Stores runbooks, post-mortems, and documentation for RAG';
COMMENT ON TABLE analysis_feedback IS 'Stores user feedback for model improvement';
COMMENT ON TABLE installation_settings IS 'Stores per-installation/organization settings';
COMMENT ON TABLE slack_messages IS 'Tracks Slack messages for interactive updates';

-- ==================== Initial Data ====================

-- Insert default settings for testing
-- (In production, these would be created when a GitHub App is installed)
