/**
 * Feedback Types
 *
 * Type definitions for analysis and RAG feedback.
 *
 * @module database/feedback/types
 */

import type { RAGRelevance } from "../common.js";

// ==================== Types ====================

/**
 * Feedback type for analysis quality rating.
 */
export type FeedbackType =
  | "correct"
  | "incorrect"
  | "flaky"
  | "needs_more_context"
  | "rag_helpful"
  | "rag_not_helpful"
  | "rag_partially_helpful"
  | "qa_helpful"
  | "qa_not_helpful";

/**
 * Input for creating RAG feedback.
 */
export interface CreateRAGFeedbackInput {
  readonly analysisId: string;
  readonly knowledgeDocId: string;
  readonly ragRelevance: RAGRelevance;
  readonly retrievalSimilarity: number;
  readonly retrievalRank: number;
  readonly userId: string;
  readonly slackChannel?: string;
  readonly slackMessageTs?: string;
}

/**
 * Input for creating general analysis feedback.
 */
export interface CreateAnalysisFeedbackInput {
  readonly analysisId: string;
  readonly feedbackType: FeedbackType;
  readonly userId: string;
  readonly tenantId: string;
  readonly correction?: string;
  readonly slackChannel?: string;
  readonly slackMessageTs?: string;
}

/**
 * Input for creating Q&A feedback.
 */
export interface CreateQAFeedbackInput {
  readonly queryId: string;
  readonly query: string;
  readonly feedbackType: "qa_helpful" | "qa_not_helpful";
  readonly userId: string;
  readonly tenantId: string;
  readonly slackChannel?: string;
  readonly slackMessageTs?: string;
  readonly resultCount?: number;
}

/**
 * Feedback record from database.
 */
export interface FeedbackRecord {
  readonly id: string;
  readonly analysisId: string | null;
  readonly feedbackType: FeedbackType;
  readonly correction: string | null;
  readonly userId: string;
  readonly slackChannel: string | null;
  readonly slackMessageTs: string | null;
  readonly knowledgeDocId: string | null;
  readonly ragRelevance: RAGRelevance | null;
  readonly retrievalSimilarity: number | null;
  readonly retrievalRank: number | null;
  readonly createdAt: Date;
}

/**
 * RAG feedback metrics for evaluation.
 */
export interface RAGFeedbackMetrics {
  readonly totalFeedback: number;
  readonly helpfulCount: number;
  readonly notHelpfulCount: number;
  readonly partiallyHelpfulCount: number;
  readonly helpfulRate: number;
  readonly averageSimilarity: number;
  readonly averageRank: number;
}

// ==================== Database Row Types ====================

/**
 * Database row for feedback.
 */
export interface FeedbackRow {
  readonly id: string;
  readonly analysis_id: string | null;
  readonly feedback_type: string;
  readonly correction: string | null;
  readonly user_id: string;
  readonly slack_channel: string | null;
  readonly slack_message_ts: string | null;
  readonly knowledge_doc_id: string | null;
  readonly rag_relevance: string | null;
  readonly retrieval_similarity: string | null;
  readonly retrieval_rank: number | null;
  readonly created_at: Date;
}

/**
 * Database row for metrics aggregation.
 */
export interface MetricsRow {
  readonly total_feedback: string;
  readonly helpful_count: string;
  readonly not_helpful_count: string;
  readonly partially_helpful_count: string;
  readonly avg_similarity: string | null;
  readonly avg_rank: string | null;
}

// ==================== Validation Types ====================

/**
 * Validation rule for CreateRAGFeedbackInput fields.
 */
export interface RAGFeedbackValidationRule {
  readonly field: keyof CreateRAGFeedbackInput;
  readonly isInvalid: (input: CreateRAGFeedbackInput) => boolean;
  readonly message: string;
  readonly getValue?: (input: CreateRAGFeedbackInput) => unknown;
}

/**
 * Validation rule for CreateAnalysisFeedbackInput fields.
 */
export interface AnalysisFeedbackValidationRule {
  readonly field: keyof CreateAnalysisFeedbackInput;
  readonly isInvalid: (input: CreateAnalysisFeedbackInput) => boolean;
  readonly message: string;
  readonly getValue?: (input: CreateAnalysisFeedbackInput) => unknown;
}

/**
 * Validation rule for CreateQAFeedbackInput fields.
 */
export interface QAFeedbackValidationRule {
  readonly field: keyof CreateQAFeedbackInput;
  readonly isInvalid: (input: CreateQAFeedbackInput) => boolean;
  readonly message: string;
  readonly getValue?: (input: CreateQAFeedbackInput) => unknown;
}
