/**
 * Feedback Types
 *
 * Type definitions for analysis and RAG feedback.
 * Separated from feedbackRepository for module size compliance.
 *
 * @module database/feedbackTypes
 */

import type { RAGRelevance } from "../rag/evaluation.js";

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
