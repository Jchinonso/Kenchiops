/**
 * Feedback Module
 *
 * Database operations for analysis and RAG feedback.
 *
 * @module database/feedback
 */

// Types
export type {
  FeedbackType,
  CreateRAGFeedbackInput,
  CreateAnalysisFeedbackInput,
  CreateQAFeedbackInput,
  FeedbackRecord,
  RAGFeedbackMetrics,
  FeedbackRow,
  MetricsRow,
  RAGFeedbackValidationRule,
  AnalysisFeedbackValidationRule,
  QAFeedbackValidationRule,
} from "./types.js";

// Helpers (includes validation and mappers)
export {
  validateNonEmptyString,
  validateMinimumNumber,
  validateRAGFeedbackInput,
  validateAnalysisFeedbackInput,
  validateQAFeedbackInput,
  mapRowToFeedback,
  mapRAGRelevanceToFeedbackType,
} from "./helpers.js";

// Repository operations
export {
  createRAGFeedback,
  createAnalysisFeedback,
  getFeedbackByAnalysis,
  getRAGFeedbackMetrics,
  getRAGFeedbackByDoc,
  getFeedbackByUserAndAnalysis,
  updateFeedbackType,
  createOrUpdateAnalysisFeedback,
  getQAFeedbackByQueryAndUser,
  createQAFeedback,
  createOrUpdateQAFeedback,
} from "./repository.js";
