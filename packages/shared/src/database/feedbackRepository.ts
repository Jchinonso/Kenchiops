/**
 * Feedback Repository
 *
 * Database operations for analysis feedback and RAG feedback.
 * Supports fine-tuning data collection and evaluation metrics.
 *
 * @module database/feedbackRepository
 */

import { query } from "./client.js";
import { createLogger } from "../core/logger.js";
import { generateEventId } from "../core/utils.js";
import type { RAGRelevance } from "../rag/evaluation.js";

import type {
  FeedbackType,
  CreateRAGFeedbackInput,
  CreateAnalysisFeedbackInput,
  CreateQAFeedbackInput,
  FeedbackRecord,
  RAGFeedbackMetrics,
} from "./feedbackTypes.js";

// Re-export types for backward compatibility
export type {
  FeedbackType,
  CreateRAGFeedbackInput,
  CreateAnalysisFeedbackInput,
  CreateQAFeedbackInput,
  FeedbackRecord,
  RAGFeedbackMetrics,
} from "./feedbackTypes.js";

const logger = createLogger("feedback-repository");

// ==================== Row Types ====================

interface FeedbackRow {
  id: string;
  analysis_id: string | null;
  feedback_type: string;
  correction: string | null;
  user_id: string;
  slack_channel: string | null;
  slack_message_ts: string | null;
  knowledge_doc_id: string | null;
  rag_relevance: string | null;
  retrieval_similarity: string | null;
  retrieval_rank: number | null;
  created_at: Date;
}

interface MetricsRow {
  total_feedback: string;
  helpful_count: string;
  not_helpful_count: string;
  partially_helpful_count: string;
  avg_similarity: string | null;
  avg_rank: string | null;
}

// ==================== SQL Queries ====================

const FEEDBACK_QUERIES = {
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
    LIMIT 1
  `,

  GET_FEEDBACK_BY_ANALYSIS: `
    SELECT * FROM analysis_feedback
    WHERE analysis_id = $1
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
    LIMIT 1
  `,

  UPDATE_FEEDBACK_TYPE: `
    UPDATE analysis_feedback
    SET feedback_type = $1, updated_at = NOW()
    WHERE id = $2
    RETURNING *
  `,
} as const;

// ==================== Mappers ====================

const mapRowToFeedback = (row: FeedbackRow): FeedbackRecord => ({
  id: row.id,
  analysisId: row.analysis_id,
  feedbackType: row.feedback_type as FeedbackType,
  correction: row.correction,
  userId: row.user_id,
  slackChannel: row.slack_channel,
  slackMessageTs: row.slack_message_ts,
  knowledgeDocId: row.knowledge_doc_id,
  ragRelevance: row.rag_relevance as RAGRelevance | null,
  retrievalSimilarity: row.retrieval_similarity ? parseFloat(row.retrieval_similarity) : null,
  retrievalRank: row.retrieval_rank,
  createdAt: row.created_at,
});

const mapRAGRelevanceToFeedbackType = (relevance: RAGRelevance): FeedbackType => {
  const mapping: Record<RAGRelevance, FeedbackType> = {
    helpful: "rag_helpful",
    not_helpful: "rag_not_helpful",
    partially_helpful: "rag_partially_helpful",
  };
  return mapping[relevance];
};

// ==================== Public API ====================

/**
 * Creates RAG feedback for a retrieved knowledge document.
 *
 * @param input - RAG feedback data
 * @returns The created feedback record
 */
export const createRAGFeedback = async (input: CreateRAGFeedbackInput): Promise<FeedbackRecord> => {
  const id = generateEventId();
  const feedbackType = mapRAGRelevanceToFeedbackType(input.ragRelevance);

  const result = await query<FeedbackRow>(FEEDBACK_QUERIES.INSERT_RAG_FEEDBACK, [
    id,
    input.analysisId,
    feedbackType,
    input.userId,
    input.slackChannel ?? null,
    input.slackMessageTs ?? null,
    input.knowledgeDocId,
    input.ragRelevance,
    input.retrievalSimilarity,
    input.retrievalRank,
  ]);

  logger.info("Created RAG feedback", {
    id,
    analysisId: input.analysisId,
    knowledgeDocId: input.knowledgeDocId,
    relevance: input.ragRelevance,
  });

  return mapRowToFeedback(result.rows[0]);
};

/**
 * Creates general analysis feedback.
 *
 * @param input - Analysis feedback data
 * @returns The created feedback record
 */
export const createAnalysisFeedback = async (
  input: CreateAnalysisFeedbackInput
): Promise<FeedbackRecord> => {
  const id = generateEventId();

  const result = await query<FeedbackRow>(FEEDBACK_QUERIES.INSERT_ANALYSIS_FEEDBACK, [
    id,
    input.analysisId,
    input.feedbackType,
    input.correction ?? null,
    input.userId,
    input.slackChannel ?? null,
    input.slackMessageTs ?? null,
  ]);

  logger.info("Created analysis feedback", {
    id,
    analysisId: input.analysisId,
    feedbackType: input.feedbackType,
  });

  return mapRowToFeedback(result.rows[0]);
};

/**
 * Gets all feedback for an analysis.
 *
 * @param analysisId - Analysis ID
 * @returns Array of feedback records
 */
export const getFeedbackByAnalysis = async (
  analysisId: string
): Promise<readonly FeedbackRecord[]> => {
  const result = await query<FeedbackRow>(FEEDBACK_QUERIES.GET_FEEDBACK_BY_ANALYSIS, [analysisId]);

  return Object.freeze(result.rows.map(mapRowToFeedback));
};

/**
 * Gets RAG feedback metrics for a time window.
 *
 * @param windowMinutes - Time window in minutes (default: 60)
 * @returns RAG feedback metrics
 */
export const getRAGFeedbackMetrics = async (
  windowMinutes: number = 60
): Promise<RAGFeedbackMetrics> => {
  const result = await query<MetricsRow>(FEEDBACK_QUERIES.GET_RAG_FEEDBACK_METRICS, [
    windowMinutes,
  ]);

  const row = result.rows[0];
  const totalFeedback = parseInt(row.total_feedback, 10);
  const helpfulCount = parseInt(row.helpful_count, 10);

  return {
    totalFeedback,
    helpfulCount,
    notHelpfulCount: parseInt(row.not_helpful_count, 10),
    partiallyHelpfulCount: parseInt(row.partially_helpful_count, 10),
    helpfulRate: totalFeedback > 0 ? helpfulCount / totalFeedback : 0,
    averageSimilarity: row.avg_similarity ? parseFloat(row.avg_similarity) : 0,
    averageRank: row.avg_rank ? parseFloat(row.avg_rank) : 0,
  };
};

/**
 * Gets RAG feedback for a specific knowledge document.
 *
 * @param knowledgeDocId - Knowledge document ID
 * @param limit - Maximum number of records to return
 * @returns Array of feedback records
 */
export const getRAGFeedbackByDoc = async (
  knowledgeDocId: string,
  limit: number = 100
): Promise<readonly FeedbackRecord[]> => {
  const result = await query<FeedbackRow>(FEEDBACK_QUERIES.GET_RAG_FEEDBACK_BY_DOC, [
    knowledgeDocId,
    limit,
  ]);

  return Object.freeze(result.rows.map(mapRowToFeedback));
};

/**
 * Gets existing feedback for a user on a specific analysis.
 * Used for deduplication - prevents duplicate votes.
 *
 * @param analysisId - Analysis ID
 * @param userId - User ID (GitHub username or Slack user ID)
 * @returns Existing feedback record or null
 */
export const getFeedbackByUserAndAnalysis = async (
  analysisId: string,
  userId: string
): Promise<FeedbackRecord | null> => {
  const result = await query<FeedbackRow>(FEEDBACK_QUERIES.GET_FEEDBACK_BY_USER_AND_ANALYSIS, [
    analysisId,
    userId,
  ]);

  return result.rows.length > 0 ? mapRowToFeedback(result.rows[0]) : null;
};

/**
 * Updates the feedback type for an existing feedback record.
 * Used when a user changes their vote.
 *
 * @param feedbackId - Feedback record ID
 * @param feedbackType - New feedback type
 * @returns Updated feedback record
 */
export const updateFeedbackType = async (
  feedbackId: string,
  feedbackType: FeedbackType
): Promise<FeedbackRecord> => {
  const result = await query<FeedbackRow>(FEEDBACK_QUERIES.UPDATE_FEEDBACK_TYPE, [
    feedbackType,
    feedbackId,
  ]);

  logger.info("Updated feedback type", { feedbackId, feedbackType });

  return mapRowToFeedback(result.rows[0]);
};

/**
 * Creates or updates analysis feedback with deduplication.
 * If user already voted, updates their vote instead of creating duplicate.
 *
 * @param input - Analysis feedback data
 * @returns Object with feedback record and whether it was updated vs created
 */
export const createOrUpdateAnalysisFeedback = async (
  input: CreateAnalysisFeedbackInput
): Promise<{ feedback: FeedbackRecord; wasUpdated: boolean }> => {
  // Check for existing feedback from this user
  const existingFeedback = await getFeedbackByUserAndAnalysis(input.analysisId, input.userId);

  if (existingFeedback) {
    // User already voted - update their vote
    const updatedFeedback = await updateFeedbackType(existingFeedback.id, input.feedbackType);
    logger.info("Updated existing feedback", {
      feedbackId: existingFeedback.id,
      analysisId: input.analysisId,
      oldType: existingFeedback.feedbackType,
      newType: input.feedbackType,
    });
    return { feedback: updatedFeedback, wasUpdated: true };
  }

  // No existing feedback - create new
  const newFeedback = await createAnalysisFeedback(input);
  return { feedback: newFeedback, wasUpdated: false };
};

/**
 * Gets existing Q&A feedback for a user on a specific query.
 * Used for deduplication - prevents duplicate votes.
 *
 * @param queryId - Q&A query ID
 * @param userId - User ID (Slack user ID)
 * @returns Existing feedback record or null
 */
export const getQAFeedbackByQueryAndUser = async (
  queryId: string,
  userId: string
): Promise<FeedbackRecord | null> => {
  const result = await query<FeedbackRow>(FEEDBACK_QUERIES.GET_QA_FEEDBACK_BY_QUERY, [
    queryId,
    userId,
  ]);

  return result.rows.length > 0 ? mapRowToFeedback(result.rows[0]) : null;
};

/**
 * Creates Q&A feedback for a knowledge base search.
 *
 * @param input - Q&A feedback data
 * @returns The created feedback record
 */
export const createQAFeedback = async (input: CreateQAFeedbackInput): Promise<FeedbackRecord> => {
  const id = generateEventId();

  const result = await query<FeedbackRow>(FEEDBACK_QUERIES.INSERT_QA_FEEDBACK, [
    id,
    input.queryId, // Store queryId as analysis_id
    input.feedbackType,
    input.query, // Store query text in correction field
    input.userId,
    input.slackChannel ?? null,
    input.slackMessageTs ?? null,
  ]);

  logger.info("Created Q&A feedback", {
    id,
    queryId: input.queryId,
    feedbackType: input.feedbackType,
    resultCount: input.resultCount,
  });

  return mapRowToFeedback(result.rows[0]);
};

/**
 * Creates or updates Q&A feedback with deduplication.
 * If user already voted on this query, updates their vote.
 *
 * @param input - Q&A feedback data
 * @returns Object with feedback record and whether it was updated vs created
 */
export const createOrUpdateQAFeedback = async (
  input: CreateQAFeedbackInput
): Promise<{ feedback: FeedbackRecord; wasUpdated: boolean }> => {
  // Check for existing feedback from this user on this query
  const existingFeedback = await getQAFeedbackByQueryAndUser(input.queryId, input.userId);

  if (existingFeedback) {
    // User already voted - update their vote
    const updatedFeedback = await updateFeedbackType(existingFeedback.id, input.feedbackType);
    logger.info("Updated existing Q&A feedback", {
      feedbackId: existingFeedback.id,
      queryId: input.queryId,
      oldType: existingFeedback.feedbackType,
      newType: input.feedbackType,
    });
    return { feedback: updatedFeedback, wasUpdated: true };
  }

  // No existing feedback - create new
  const newFeedback = await createQAFeedback(input);
  return { feedback: newFeedback, wasUpdated: false };
};
