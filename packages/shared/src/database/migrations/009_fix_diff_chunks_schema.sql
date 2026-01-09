-- Migration: 009_fix_diff_chunks_schema
-- Description: Add missing columns to diff_chunks table for RAG operations
-- Fixes schema mismatch between diff_chunks and repository code

-- ============================================================
-- Add missing columns to diff_chunks table
-- ============================================================

-- Tenant tracking for multi-tenant support
ALTER TABLE diff_chunks ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_diff_chunks_tenant ON diff_chunks(tenant_id);

-- Timestamp tracking
ALTER TABLE diff_chunks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE diff_chunks ADD COLUMN IF NOT EXISTS last_refreshed_at TIMESTAMP WITH TIME ZONE;

-- Embedding model tracking for re-embedding support
ALTER TABLE diff_chunks ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(100);
ALTER TABLE diff_chunks ADD COLUMN IF NOT EXISTS embedding_version VARCHAR(20);

-- Create index for embedding model queries (for re-embedding checks)
CREATE INDEX IF NOT EXISTS idx_diff_chunks_embedding_model ON diff_chunks(embedding_model, embedding_version);

-- Add foreign key for tenant (optional - allows orphaned chunks)
-- Not adding strict FK to allow chunks to exist without tenant context

-- ============================================================
-- Add same missing columns to knowledge_docs table if needed
-- ============================================================

ALTER TABLE knowledge_docs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE knowledge_docs ADD COLUMN IF NOT EXISTS last_refreshed_at TIMESTAMP WITH TIME ZONE;

-- ============================================================
-- Comments for documentation
-- ============================================================

COMMENT ON COLUMN diff_chunks.tenant_id IS 'Tenant ID for multi-tenant isolation';
COMMENT ON COLUMN diff_chunks.updated_at IS 'Last update timestamp for change tracking';
COMMENT ON COLUMN diff_chunks.last_refreshed_at IS 'When this chunk was last refreshed/validated';
COMMENT ON COLUMN diff_chunks.embedding_model IS 'OpenAI embedding model used (e.g., text-embedding-3-small)';
COMMENT ON COLUMN diff_chunks.embedding_version IS 'Embedding model version for re-embedding checks';
