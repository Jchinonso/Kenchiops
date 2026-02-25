/**
 * Feedback Constants
 *
 * SQL queries and configuration for feedback repository operations.
 *
 * @module constants/feedback
 */

// ==================== Default Values ====================

/**
 * Default configuration for feedback operations.
 */
export const FEEDBACK_DEFAULTS = {
  /** Default time window for metrics in minutes. */
  DEFAULT_METRICS_WINDOW_MINUTES: 60,
  /** Default limit for feedback queries. */
  DEFAULT_QUERY_LIMIT: 100,
  /** Minimum valid query limit. */
  MIN_QUERY_LIMIT: 1,
  /** Minimum valid time window in minutes. */
  MIN_WINDOW_MINUTES: 1,
  /** Default value for zero metrics. */
  DEFAULT_ZERO_VALUE: 0,
} as const;

// ==================== SQL Queries ====================

/**
 * SQL query templates for feedback operations.
 */
export const FEEDBACK_QUERIES = {
  INSERT_RAG_FEEDBACK: `
    INSERT INTO analysis_feedback (
      id, analysis_id, feedback_type, user_id, slack_channel, slack_message_ts,
      knowledge_doc_id, rag_relevance, retrieval_similarity, retrieval_rank
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `,

  INSERT_ANALYSIS_FEEDBACK: `
    INSERT INTO analysis_feedback (
      id, analysis_id, feedback_type, correction, user_id, slack_channel, slack_message_ts
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `,

  INSERT_QA_FEEDBACK: `
    INSERT INTO analysis_feedback (
      id, analysis_id, feedback_type, correction, user_id, slack_channel, slack_message_ts
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `,

  GET_QA_FEEDBACK_BY_QUERY: `
    SELECT * FROM analysis_feedback
    WHERE analysis_id = $1 AND user_id = $2
      AND feedback_type IN ('qa_helpful', 'qa_not_helpful')
      AND analysis_id IN (SELECT id FROM analyses WHERE tenant_id = $3)
    LIMIT 1
  `,

  GET_FEEDBACK_BY_ANALYSIS: `
    SELECT * FROM analysis_feedback
    WHERE analysis_id = $1
      AND analysis_id IN (SELECT id FROM analyses WHERE tenant_id = $2)
    ORDER BY created_at DESC
  `,

  GET_RAG_FEEDBACK_METRICS: `
    SELECT
      COUNT(*) as total_feedback,
      COUNT(*) FILTER (WHERE rag_relevance = 'helpful') as helpful_count,
      COUNT(*) FILTER (WHERE rag_relevance = 'not_helpful') as not_helpful_count,
      COUNT(*) FILTER (WHERE rag_relevance = 'partially_helpful') as partially_helpful_count,
      AVG(retrieval_similarity) as avg_similarity,
      AVG(retrieval_rank) as avg_rank
    FROM analysis_feedback
    WHERE rag_relevance IS NOT NULL
      AND created_at >= NOW() - INTERVAL '1 minute' * $1
  `,

  GET_RAG_FEEDBACK_BY_DOC: `
    SELECT * FROM analysis_feedback
    WHERE knowledge_doc_id = $1
    ORDER BY created_at DESC
    LIMIT $2
  `,

  GET_FEEDBACK_BY_USER_AND_ANALYSIS: `
    SELECT * FROM analysis_feedback
    WHERE analysis_id = $1 AND user_id = $2
      AND analysis_id IN (SELECT id FROM analyses WHERE tenant_id = $3)
    LIMIT 1
  `,

  UPDATE_FEEDBACK_TYPE: `
    UPDATE analysis_feedback
    SET feedback_type = $1, updated_at = NOW()
    WHERE id = $2 AND analysis_id IN (SELECT id FROM analyses WHERE tenant_id = $3)
    RETURNING *
  `,
} as const;
