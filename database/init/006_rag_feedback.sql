-- Migration: RAG Feedback Support
-- Extends analysis_feedback to support feedback on RAG-retrieved knowledge documents

-- ==================== Add RAG Feedback Fields ====================

-- Add column for knowledge document reference (which doc was rated)
ALTER TABLE analysis_feedback
ADD COLUMN IF NOT EXISTS knowledge_doc_id VARCHAR(50) REFERENCES knowledge_documents(id) ON DELETE SET NULL;

-- Add column for RAG-specific feedback (did the retrieved doc help?)
ALTER TABLE analysis_feedback
ADD COLUMN IF NOT EXISTS rag_relevance VARCHAR(20) CHECK (rag_relevance IN ('helpful', 'not_helpful', 'partially_helpful'));

-- Add column for similarity score at time of retrieval (for metrics)
ALTER TABLE analysis_feedback
ADD COLUMN IF NOT EXISTS retrieval_similarity DECIMAL(5,4);

-- Add column for retrieval position/rank (for Recall@K, MRR)
ALTER TABLE analysis_feedback
ADD COLUMN IF NOT EXISTS retrieval_rank INTEGER;

-- ==================== Update Feedback Type Constraint ====================

-- Drop the existing constraint
ALTER TABLE analysis_feedback DROP CONSTRAINT IF EXISTS analysis_feedback_feedback_type_check;

-- Add updated constraint with new RAG feedback types
ALTER TABLE analysis_feedback ADD CONSTRAINT analysis_feedback_feedback_type_check
CHECK (feedback_type IN (
  -- Existing types
  'correct',
  'incorrect',
  'flaky',
  'needs_more_context',
  -- RAG-specific types
  'rag_helpful',
  'rag_not_helpful',
  'rag_partially_helpful'
));

-- ==================== Indexes ====================

-- Index for RAG feedback queries
CREATE INDEX IF NOT EXISTS idx_feedback_knowledge_doc_id ON analysis_feedback(knowledge_doc_id);
CREATE INDEX IF NOT EXISTS idx_feedback_rag_relevance ON analysis_feedback(rag_relevance);

-- ==================== Comments ====================

COMMENT ON COLUMN analysis_feedback.knowledge_doc_id IS 'Reference to the knowledge document that was rated for RAG relevance';
COMMENT ON COLUMN analysis_feedback.rag_relevance IS 'User feedback on whether the retrieved knowledge document was helpful';
COMMENT ON COLUMN analysis_feedback.retrieval_similarity IS 'Vector similarity score at time of retrieval (0.0-1.0)';
COMMENT ON COLUMN analysis_feedback.retrieval_rank IS 'Position in the retrieval results (1 = top result)';
