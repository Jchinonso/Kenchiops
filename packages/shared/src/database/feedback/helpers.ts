/**
 * Feedback Helpers
 *
 * Validation functions and helper utilities for feedback repository operations.
 *
 * @module database/feedback/helpers
 */

import {
  ValidationError,
  validateNonEmptyString,
  validateMinimumNumber,
  type RAGRelevance,
} from "../common.js";
import type {
  CreateRAGFeedbackInput,
  CreateAnalysisFeedbackInput,
  CreateQAFeedbackInput,
  RAGFeedbackValidationRule,
  AnalysisFeedbackValidationRule,
  QAFeedbackValidationRule,
  FeedbackRow,
  FeedbackRecord,
  FeedbackType,
} from "./types.js";

// ==================== Validation Rules ====================

/** Validation rules for CreateRAGFeedbackInput. */
const RAG_FEEDBACK_VALIDATION_RULES: readonly RAGFeedbackValidationRule[] = [
  {
    field: "analysisId",
    isInvalid: (input) => input.analysisId.trim().length === 0,
    message: "Analysis ID cannot be empty",
  },
  {
    field: "knowledgeDocId",
    isInvalid: (input) => input.knowledgeDocId.trim().length === 0,
    message: "Knowledge document ID cannot be empty",
  },
  {
    field: "userId",
    isInvalid: (input) => input.userId.trim().length === 0,
    message: "User ID cannot be empty",
  },
  {
    field: "retrievalSimilarity",
    isInvalid: (input) => !Number.isFinite(input.retrievalSimilarity),
    message: "Retrieval similarity must be a valid number",
    getValue: (input) => input.retrievalSimilarity,
  },
  {
    field: "retrievalRank",
    isInvalid: (input) => !Number.isFinite(input.retrievalRank) || input.retrievalRank < 0,
    message: "Retrieval rank must be a non-negative number",
    getValue: (input) => input.retrievalRank,
  },
];

/** Validation rules for CreateAnalysisFeedbackInput. */
const ANALYSIS_FEEDBACK_VALIDATION_RULES: readonly AnalysisFeedbackValidationRule[] = [
  {
    field: "analysisId",
    isInvalid: (input) => input.analysisId.trim().length === 0,
    message: "Analysis ID cannot be empty",
  },
  {
    field: "userId",
    isInvalid: (input) => input.userId.trim().length === 0,
    message: "User ID cannot be empty",
  },
];

/** Validation rules for CreateQAFeedbackInput. */
const QA_FEEDBACK_VALIDATION_RULES: readonly QAFeedbackValidationRule[] = [
  {
    field: "queryId",
    isInvalid: (input) => input.queryId.trim().length === 0,
    message: "Query ID cannot be empty",
  },
  {
    field: "query",
    isInvalid: (input) => input.query.trim().length === 0,
    message: "Query cannot be empty",
  },
  {
    field: "userId",
    isInvalid: (input) => input.userId.trim().length === 0,
    message: "User ID cannot be empty",
  },
];

// ==================== Validation Functions ====================

// Re-export shared validators for backwards compatibility
export { validateNonEmptyString, validateMinimumNumber };

/**
 * Validates CreateRAGFeedbackInput.
 *
 * @throws ValidationError if input is invalid
 */
export const validateRAGFeedbackInput = (input: CreateRAGFeedbackInput): void => {
  const failedRule = RAG_FEEDBACK_VALIDATION_RULES.find((rule) => rule.isInvalid(input));

  if (failedRule === undefined) {
    return;
  }

  const metadata: Record<string, unknown> = { field: failedRule.field };

  if (failedRule.getValue !== undefined) {
    metadata.value = failedRule.getValue(input);
  }

  throw new ValidationError(failedRule.message, {
    operation: "validateRAGFeedbackInput",
    metadata,
  });
};

/**
 * Validates CreateAnalysisFeedbackInput.
 *
 * @throws ValidationError if input is invalid
 */
export const validateAnalysisFeedbackInput = (input: CreateAnalysisFeedbackInput): void => {
  const failedRule = ANALYSIS_FEEDBACK_VALIDATION_RULES.find((rule) => rule.isInvalid(input));

  if (failedRule === undefined) {
    return;
  }

  const metadata: Record<string, unknown> = { field: failedRule.field };

  if (failedRule.getValue !== undefined) {
    metadata.value = failedRule.getValue(input);
  }

  throw new ValidationError(failedRule.message, {
    operation: "validateAnalysisFeedbackInput",
    metadata,
  });
};

/**
 * Validates CreateQAFeedbackInput.
 *
 * @throws ValidationError if input is invalid
 */
export const validateQAFeedbackInput = (input: CreateQAFeedbackInput): void => {
  const failedRule = QA_FEEDBACK_VALIDATION_RULES.find((rule) => rule.isInvalid(input));

  if (failedRule === undefined) {
    return;
  }

  const metadata: Record<string, unknown> = { field: failedRule.field };

  if (failedRule.getValue !== undefined) {
    metadata.value = failedRule.getValue(input);
  }

  throw new ValidationError(failedRule.message, {
    operation: "validateQAFeedbackInput",
    metadata,
  });
};

// ==================== Row Mappers ====================

/**
 * Maps database row to FeedbackRecord.
 */
export const mapRowToFeedback = (row: FeedbackRow): FeedbackRecord => ({
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

/** Mapping from RAGRelevance to FeedbackType. */
const RAG_RELEVANCE_TO_FEEDBACK_TYPE: Record<RAGRelevance, FeedbackType> = {
  helpful: "rag_helpful",
  not_helpful: "rag_not_helpful",
  partially_helpful: "rag_partially_helpful",
};

/**
 * Maps RAG relevance to corresponding feedback type.
 */
export const mapRAGRelevanceToFeedbackType = (relevance: RAGRelevance): FeedbackType =>
  RAG_RELEVANCE_TO_FEEDBACK_TYPE[relevance];
