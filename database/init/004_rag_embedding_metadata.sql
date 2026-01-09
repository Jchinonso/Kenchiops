-- RAG Embedding Metadata Migration
-- Adds columns for embedding provenance, chunking metadata, and tenant isolation.
-- This enables re-embedding when OpenAI releases upgraded models.

-- ==================== Diff Chunks Columns ====================

-- Add embedding metadata columns to diff_chunks
ALTER TABLE diff_chunks
ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(50) DEFAULT 'text-embedding-3-small',
ADD COLUMN IF NOT EXISTS embedding_version VARCHAR(20) DEFAULT '1',
ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50);

-- Add chunking metadata to diff_chunks
ALTER TABLE diff_chunks
ADD COLUMN IF NOT EXISTS chunk_index INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS start_line INTEGER,
ADD COLUMN IF NOT EXISTS end_line INTEGER,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ==================== Knowledge Documents Columns ====================

-- Add embedding metadata columns to knowledge_documents
ALTER TABLE knowledge_documents
ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(50) DEFAULT 'text-embedding-3-small',
ADD COLUMN IF NOT EXISTS embedding_version VARCHAR(20) DEFAULT '1',
ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(50);

-- Add chunking and source metadata to knowledge_documents
ALTER TABLE knowledge_documents
ADD COLUMN IF NOT EXISTS parent_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS source_url TEXT,
ADD COLUMN IF NOT EXISTS file_path TEXT,
ADD COLUMN IF NOT EXISTS chunk_index INTEGER DEFAULT 0;

-- ==================== Indexes for Tenant Isolation ====================

-- Add tenant_id index for tenant isolation (governance requirement)
CREATE INDEX IF NOT EXISTS idx_diff_chunks_tenant ON diff_chunks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_tenant ON knowledge_documents(tenant_id);

-- ==================== Indexes for Re-embedding Queries ====================

-- Add embedding_model index for re-embedding queries
CREATE INDEX IF NOT EXISTS idx_diff_chunks_embedding_model ON diff_chunks(embedding_model);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_embedding_model ON knowledge_documents(embedding_model);

-- Add index for finding chunks without embeddings
CREATE INDEX IF NOT EXISTS idx_diff_chunks_no_embedding ON diff_chunks(created_at) WHERE embedding IS NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_no_embedding ON knowledge_documents(created_at) WHERE embedding IS NULL;

-- ==================== Indexes for Parent-Child Relationships ====================

-- Add index for parent document lookups
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_parent ON knowledge_documents(parent_id);

-- ==================== IVFFlat Indexes for Vector Search ====================
-- Note: These indexes improve search performance significantly but require data to exist.
-- Run these AFTER initial data ingestion (ideally with 1000+ rows).
-- The 'lists' parameter should be approximately sqrt(num_rows).

-- For diff_chunks (uncomment after data ingestion):
-- CREATE INDEX IF NOT EXISTS idx_diff_chunks_embedding_ivfflat
--     ON diff_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- For knowledge_documents (uncomment after data ingestion):
-- CREATE INDEX IF NOT EXISTS idx_knowledge_docs_embedding_ivfflat
--     ON knowledge_documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ==================== Triggers ====================

-- Add updated_at trigger for diff_chunks
DROP TRIGGER IF EXISTS update_diff_chunks_updated_at ON diff_chunks;
CREATE TRIGGER update_diff_chunks_updated_at
    BEFORE UPDATE ON diff_chunks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==================== Comments ====================

COMMENT ON COLUMN diff_chunks.embedding_model IS 'OpenAI model used to generate the embedding';
COMMENT ON COLUMN diff_chunks.embedding_version IS 'Version tag for tracking re-embedding cycles';
COMMENT ON COLUMN diff_chunks.tenant_id IS 'Tenant ID for multi-tenant isolation';
COMMENT ON COLUMN diff_chunks.chunk_index IS 'Zero-based index of this chunk within the file diff';
COMMENT ON COLUMN diff_chunks.start_line IS 'Starting line number in the original file';
COMMENT ON COLUMN diff_chunks.end_line IS 'Ending line number in the original file';

COMMENT ON COLUMN knowledge_documents.embedding_model IS 'OpenAI model used to generate the embedding';
COMMENT ON COLUMN knowledge_documents.embedding_version IS 'Version tag for tracking re-embedding cycles';
COMMENT ON COLUMN knowledge_documents.tenant_id IS 'Tenant ID for multi-tenant isolation';
COMMENT ON COLUMN knowledge_documents.parent_id IS 'ID of the parent document if this is a chunk';
COMMENT ON COLUMN knowledge_documents.source_url IS 'Original URL of the document source';
COMMENT ON COLUMN knowledge_documents.file_path IS 'File path if document was loaded from a file';
COMMENT ON COLUMN knowledge_documents.chunk_index IS 'Zero-based index of this chunk within the parent document';
