-- Migration: RAG Phase 4 - Advanced Enhancements
-- Supports: Multi-Hop RAG, Cross-Repo Knowledge, Streaming Updates, Automated QA, Cost Controls

-- ==================== Incident Relationships (Multi-Hop RAG) ====================
-- Graph structure for linking related incidents/documents

CREATE TABLE IF NOT EXISTS incident_relationships (
    id VARCHAR(36) PRIMARY KEY,
    from_doc_id VARCHAR(50) NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    to_doc_id VARCHAR(50) NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    relationship_type VARCHAR(30) NOT NULL CHECK (relationship_type IN (
        'caused_by',
        'related_to',
        'mitigated_by',
        'depends_on',
        'duplicate_of',
        'supersedes',
        'blocks',
        'parent_of',
        'child_of'
    )),
    strength DECIMAL(3,2) NOT NULL DEFAULT 1.0 CHECK (strength >= 0 AND strength <= 1),
    metadata JSONB DEFAULT '{}',
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT no_self_reference CHECK (from_doc_id != to_doc_id),
    CONSTRAINT unique_relationship UNIQUE (from_doc_id, to_doc_id, relationship_type)
);

-- Indexes for graph traversal
CREATE INDEX IF NOT EXISTS idx_relationships_from_doc ON incident_relationships(from_doc_id);
CREATE INDEX IF NOT EXISTS idx_relationships_to_doc ON incident_relationships(to_doc_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON incident_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_relationships_strength ON incident_relationships(strength DESC);

-- ==================== External Sources (Cross-Repo Knowledge) ====================
-- Registry of external knowledge sources with opt-in tracking

CREATE TABLE IF NOT EXISTS external_sources (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    source_type VARCHAR(30) NOT NULL CHECK (source_type IN (
        'github_issues',
        'confluence',
        'notion',
        'public_runbooks',
        'incident_database',
        'community_docs',
        'custom_api'
    )),
    name VARCHAR(255) NOT NULL,
    base_url VARCHAR(500),
    auth_config JSONB DEFAULT '{}',
    tech_stack_tags TEXT[] DEFAULT '{}',
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    credibility_score DECIMAL(3,2) DEFAULT 0.5 CHECK (credibility_score >= 0 AND credibility_score <= 1),
    last_sync_at TIMESTAMPTZ,
    sync_frequency_hours INTEGER DEFAULT 24,
    doc_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_tenant_source UNIQUE (tenant_id, source_type, name)
);

CREATE INDEX IF NOT EXISTS idx_external_sources_tenant ON external_sources(tenant_id);
CREATE INDEX IF NOT EXISTS idx_external_sources_type ON external_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_external_sources_enabled ON external_sources(is_enabled);
CREATE INDEX IF NOT EXISTS idx_external_sources_tech_stack ON external_sources USING GIN(tech_stack_tags);

-- ==================== RAG Test Cases (Automated QA) ====================
-- Test case definitions for regression testing

CREATE TABLE IF NOT EXISTS rag_test_cases (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(50),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    query_text TEXT NOT NULL,
    expected_doc_ids TEXT[] NOT NULL,
    expected_min_recall DECIMAL(3,2) DEFAULT 0.8,
    category VARCHAR(50) DEFAULT 'general',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    priority INTEGER DEFAULT 1 CHECK (priority >= 1 AND priority <= 5),
    last_run_at TIMESTAMPTZ,
    last_result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_test_cases_tenant ON rag_test_cases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_test_cases_active ON rag_test_cases(is_active);
CREATE INDEX IF NOT EXISTS idx_test_cases_category ON rag_test_cases(category);
CREATE INDEX IF NOT EXISTS idx_test_cases_priority ON rag_test_cases(priority);

-- ==================== RAG Metrics History (Drift Detection) ====================
-- Historical metrics for trend analysis and drift detection

CREATE TABLE IF NOT EXISTS rag_metrics_history (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(50),
    metric_type VARCHAR(30) NOT NULL CHECK (metric_type IN (
        'recall_at_5',
        'recall_at_10',
        'mrr',
        'embedding_latency',
        'embedding_error_rate',
        'search_latency',
        'ingestion_rate',
        'cost_per_1k_tokens'
    )),
    metric_value DECIMAL(10,4) NOT NULL,
    baseline_value DECIMAL(10,4),
    deviation_percent DECIMAL(6,2),
    sample_size INTEGER,
    window_minutes INTEGER DEFAULT 60,
    metadata JSONB DEFAULT '{}',
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrics_history_tenant ON rag_metrics_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_metrics_history_type ON rag_metrics_history(metric_type);
CREATE INDEX IF NOT EXISTS idx_metrics_history_recorded ON rag_metrics_history(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_history_deviation ON rag_metrics_history(deviation_percent) WHERE deviation_percent IS NOT NULL;

-- ==================== Extend Knowledge Documents (TTL & Staleness) ====================
-- Add fields for streaming updates and TTL policies

ALTER TABLE knowledge_documents
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_refreshed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS refresh_frequency_hours INTEGER,
ADD COLUMN IF NOT EXISTS is_stale BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS external_source_id VARCHAR(36) REFERENCES external_sources(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS tech_stack_tags TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_knowledge_docs_expires ON knowledge_documents(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_stale ON knowledge_documents(is_stale) WHERE is_stale = TRUE;
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_external_source ON knowledge_documents(external_source_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_tech_stack ON knowledge_documents USING GIN(tech_stack_tags);

-- ==================== Extend Diff Chunks (TTL) ====================
-- Add TTL support to diff chunks

ALTER TABLE diff_chunks
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_stale BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_diff_chunks_expires ON diff_chunks(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_diff_chunks_stale ON diff_chunks(is_stale) WHERE is_stale = TRUE;

-- ==================== Embedding Tier Tracking ====================
-- Track embedding tier for cost control

ALTER TABLE knowledge_documents
ADD COLUMN IF NOT EXISTS embedding_tier VARCHAR(20) DEFAULT 'standard' CHECK (embedding_tier IN ('light', 'standard', 'premium'));

ALTER TABLE diff_chunks
ADD COLUMN IF NOT EXISTS embedding_tier VARCHAR(20) DEFAULT 'standard' CHECK (embedding_tier IN ('light', 'standard', 'premium'));

-- ==================== Cost Tracking Table ====================
-- Per-operation cost tracking for granular budgeting

CREATE TABLE IF NOT EXISTS rag_cost_tracking (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    operation_type VARCHAR(20) NOT NULL CHECK (operation_type IN ('embedding', 'query')),
    embedding_tier VARCHAR(20) NOT NULL CHECK (embedding_tier IN ('light', 'standard', 'premium')),
    token_count INTEGER NOT NULL DEFAULT 0,
    cost_usd DECIMAL(12,8) NOT NULL DEFAULT 0,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cost_tracking_tenant ON rag_cost_tracking(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cost_tracking_recorded ON rag_cost_tracking(recorded_at);
CREATE INDEX IF NOT EXISTS idx_cost_tracking_tenant_month ON rag_cost_tracking(tenant_id, recorded_at);

-- ==================== Comments ====================

COMMENT ON TABLE incident_relationships IS 'Graph structure for multi-hop RAG linking related incidents and documents';
COMMENT ON TABLE external_sources IS 'Registry of external knowledge sources with tenant opt-in tracking';
COMMENT ON TABLE rag_test_cases IS 'Test case definitions for RAG regression testing and QA';
COMMENT ON TABLE rag_metrics_history IS 'Historical metrics for drift detection and trend analysis';
COMMENT ON TABLE rag_cost_tracking IS 'Per-tenant cost tracking for RAG operations and budget alerts';

COMMENT ON COLUMN incident_relationships.relationship_type IS 'Type of relationship between documents (caused_by, related_to, etc.)';
COMMENT ON COLUMN incident_relationships.strength IS 'Confidence strength of the relationship (0.0-1.0)';
COMMENT ON COLUMN external_sources.credibility_score IS 'Trust score for external source (0.0-1.0)';
COMMENT ON COLUMN external_sources.tech_stack_tags IS 'Technology tags for relevance filtering';
COMMENT ON COLUMN rag_test_cases.expected_doc_ids IS 'Array of document IDs expected to be retrieved';
COMMENT ON COLUMN rag_metrics_history.deviation_percent IS 'Percentage deviation from baseline for drift detection';
COMMENT ON COLUMN knowledge_documents.expires_at IS 'TTL expiration timestamp for automatic cleanup';
COMMENT ON COLUMN knowledge_documents.is_stale IS 'Flag indicating document needs re-ingestion';
COMMENT ON COLUMN knowledge_documents.embedding_tier IS 'Embedding model tier used (light/standard/premium)';

-- ==================== Vector Indexes ====================
-- HNSW indexes for faster vector similarity search (recommended for production)
-- Note: These indexes improve query performance but increase storage and build time

-- Drop existing IVFFlat indexes if migrating to HNSW
DROP INDEX IF EXISTS idx_diff_chunks_embedding;
DROP INDEX IF EXISTS idx_knowledge_docs_embedding;

-- Create HNSW indexes with optimal parameters for text-embedding-3-small (1536 dimensions)
-- m=16: Good balance of memory/speed, ef_construction=64: Build quality
CREATE INDEX IF NOT EXISTS idx_diff_chunks_embedding_hnsw
ON diff_chunks USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64)
WHERE embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_docs_embedding_hnsw
ON knowledge_documents USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64)
WHERE embedding IS NOT NULL;

-- Partial indexes for non-stale documents (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_active_embedding_hnsw
ON knowledge_documents USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64)
WHERE embedding IS NOT NULL AND is_stale = FALSE;

CREATE INDEX IF NOT EXISTS idx_diff_chunks_active_embedding_hnsw
ON diff_chunks USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64)
WHERE embedding IS NOT NULL AND is_stale = FALSE;
