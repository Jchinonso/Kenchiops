/**
 * Feedback Repository
 *
 * Database operations for analysis feedback and RAG feedback.
 * Supports fine-tuning data collection and evaluation metrics.
 *
 * @module database/feedback/repository
 */

import {
  query,
  createLogger,
  getErrorMessage,
  generateEventId,
  FEEDBACK_DEFAULTS,
  FEEDBACK_QUERIES,
  PARSE_INT_RADIX,
} from "../common.js";
import type {
  FeedbackType,
  CreateRAGFeedbackInput,
  CreateAnalysisFeedbackInput,
  CreateQAFeedbackInput,
  FeedbackRecord,
  RAGFeedbackMetrics,
  FeedbackRow,
  MetricsRow,
} from "./types.js";
import {
  validateNonEmptyString,
  validateMinimumNumber,
  validateRAGFeedbackInput,
  validateAnalysisFeedbackInput,
  validateQAFeedbackInput,
  mapRowToFeedback,
  mapRAGRelevanceToFeedbackType,
} from "./helpers.js";

const logger = createLogger("feedback-repository");

// ==================== Public API ====================

/**
 * Creates RAG feedback for a retrieved knowledge document.
 *
 * @param input - RAG feedback data
 * @returns The created feedback record
 * @throws ValidationError if input is invalid
 * @throws Error if database operation fails
 */
export const createRAGFeedback = async (input: CreateRAGFeedbackInput): Promise<FeedbackRecord> => {
  validateRAGFeedbackInput(input);

  const id = generateEventId();
  const feedbackType = mapRAGRelevanceToFeedbackType(input.ragRelevance);

  try {
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
  } catch (error) {
    logger.error("Failed to create RAG feedback", {
      analysisId: input.analysisId,
      knowledgeDocId: input.knowledgeDocId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Creates general analysis feedback.
 *
 * @param input - Analysis feedback data
 * @returns The created feedback record
 * @throws ValidationError if input is invalid
 * @throws Error if database operation fails
 */
export const createAnalysisFeedback = async (
  input: CreateAnalysisFeedbackInput
): Promise<FeedbackRecord> => {
  validateAnalysisFeedbackInput(input);

  const id = generateEventId();

  try {
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
  } catch (error) {
    logger.error("Failed to create analysis feedback", {
      analysisId: input.analysisId,
      feedbackType: input.feedbackType,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets all feedback for an analysis.
 *
 * @param analysisId - Analysis ID
 * @returns Array of feedback records
 * @throws ValidationError if analysisId is empty
 * @throws Error if database operation fails
 */
export const getFeedbackByAnalysis = async (
  analysisId: string,
  tenantId: string
): Promise<readonly FeedbackRecord[]> => {
  validateNonEmptyString(analysisId, "analysisId");
  validateNonEmptyString(tenantId, "tenantId");

  try {
    const result = await query<FeedbackRow>(FEEDBACK_QUERIES.GET_FEEDBACK_BY_ANALYSIS, [
      analysisId,
      tenantId,
    ]);
    return Object.freeze(result.rows.map(mapRowToFeedback));
  } catch (error) {
    logger.error("Failed to get feedback by analysis", {
      analysisId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets RAG feedback metrics for a time window.
 *
 * @param windowMinutes - Time window in minutes (default: 60)
 * @returns RAG feedback metrics
 * @throws ValidationError if windowMinutes is invalid
 * @throws Error if database operation fails
 */
export const getRAGFeedbackMetrics = async (
  windowMinutes: number = FEEDBACK_DEFAULTS.DEFAULT_METRICS_WINDOW_MINUTES
): Promise<RAGFeedbackMetrics> => {
  validateMinimumNumber(windowMinutes, "windowMinutes", FEEDBACK_DEFAULTS.MIN_WINDOW_MINUTES);

  try {
    const result = await query<MetricsRow>(FEEDBACK_QUERIES.GET_RAG_FEEDBACK_METRICS, [
      windowMinutes,
    ]);

    const row = result.rows[0];
    const totalFeedback = parseInt(row.total_feedback, PARSE_INT_RADIX);
    const helpfulCount = parseInt(row.helpful_count, PARSE_INT_RADIX);

    return {
      totalFeedback,
      helpfulCount,
      notHelpfulCount: parseInt(row.not_helpful_count, PARSE_INT_RADIX),
      partiallyHelpfulCount: parseInt(row.partially_helpful_count, PARSE_INT_RADIX),
      helpfulRate:
        totalFeedback > FEEDBACK_DEFAULTS.DEFAULT_ZERO_VALUE
          ? helpfulCount / totalFeedback
          : FEEDBACK_DEFAULTS.DEFAULT_ZERO_VALUE,
      averageSimilarity: row.avg_similarity
        ? parseFloat(row.avg_similarity)
        : FEEDBACK_DEFAULTS.DEFAULT_ZERO_VALUE,
      averageRank: row.avg_rank ? parseFloat(row.avg_rank) : FEEDBACK_DEFAULTS.DEFAULT_ZERO_VALUE,
    };
  } catch (error) {
    logger.error("Failed to get RAG feedback metrics", {
      windowMinutes,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets RAG feedback for a specific knowledge document.
 *
 * @param knowledgeDocId - Knowledge document ID
 * @param limit - Maximum number of records to return
 * @returns Array of feedback records
 * @throws ValidationError if knowledgeDocId is empty or limit is invalid
 * @throws Error if database operation fails
 */
export const getRAGFeedbackByDoc = async (
  knowledgeDocId: string,
  limit: number = FEEDBACK_DEFAULTS.DEFAULT_QUERY_LIMIT
): Promise<readonly FeedbackRecord[]> => {
  validateNonEmptyString(knowledgeDocId, "knowledgeDocId");
  validateMinimumNumber(limit, "limit", FEEDBACK_DEFAULTS.MIN_QUERY_LIMIT);

  try {
    const result = await query<FeedbackRow>(FEEDBACK_QUERIES.GET_RAG_FEEDBACK_BY_DOC, [
      knowledgeDocId,
      limit,
    ]);
    return Object.freeze(result.rows.map(mapRowToFeedback));
  } catch (error) {
    logger.error("Failed to get RAG feedback by doc", {
      knowledgeDocId,
      limit,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets existing feedback for a user on a specific analysis.
 * Used for deduplication - prevents duplicate votes.
 *
 * @param analysisId - Analysis ID
 * @param userId - User ID (GitHub username or Slack user ID)
 * @returns Existing feedback record or null
 * @throws ValidationError if analysisId or userId is empty
 * @throws Error if database operation fails
 */
export const getFeedbackByUserAndAnalysis = async (
  analysisId: string,
  userId: string,
  tenantId: string
): Promise<FeedbackRecord | null> => {
  validateNonEmptyString(analysisId, "analysisId");
  validateNonEmptyString(userId, "userId");
  validateNonEmptyString(tenantId, "tenantId");

  try {
    const result = await query<FeedbackRow>(FEEDBACK_QUERIES.GET_FEEDBACK_BY_USER_AND_ANALYSIS, [
      analysisId,
      userId,
      tenantId,
    ]);
    return result.rows.length > 0 ? mapRowToFeedback(result.rows[0]) : null;
  } catch (error) {
    logger.error("Failed to get feedback by user and analysis", {
      analysisId,
      userId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Updates the feedback type for an existing feedback record.
 * Used when a user changes their vote.
 *
 * @param feedbackId - Feedback record ID
 * @param feedbackType - New feedback type
 * @returns Updated feedback record
 * @throws ValidationError if feedbackId is empty
 * @throws Error if database operation fails
 */
export const updateFeedbackType = async (
  feedbackId: string,
  feedbackType: FeedbackType,
  tenantId: string
): Promise<FeedbackRecord> => {
  validateNonEmptyString(feedbackId, "feedbackId");
  validateNonEmptyString(tenantId, "tenantId");

  try {
    const result = await query<FeedbackRow>(FEEDBACK_QUERIES.UPDATE_FEEDBACK_TYPE, [
      feedbackType,
      feedbackId,
      tenantId,
    ]);

    logger.info("Updated feedback type", { feedbackId, feedbackType });
    return mapRowToFeedback(result.rows[0]);
  } catch (error) {
    logger.error("Failed to update feedback type", {
      feedbackId,
      feedbackType,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Creates or updates analysis feedback with deduplication.
 * If user already voted, updates their vote instead of creating duplicate.
 *
 * @param input - Analysis feedback data
 * @returns Object with feedback record and whether it was updated vs created
 * @throws ValidationError if input is invalid
 * @throws Error if database operation fails
 */
export const createOrUpdateAnalysisFeedback = async (
  input: CreateAnalysisFeedbackInput
): Promise<{ feedback: FeedbackRecord; wasUpdated: boolean }> => {
  validateAnalysisFeedbackInput(input);

  try {
    const existingFeedback = await getFeedbackByUserAndAnalysis(
      input.analysisId,
      input.userId,
      input.tenantId
    );

    if (existingFeedback !== null) {
      const updatedFeedback = await updateFeedbackType(
        existingFeedback.id,
        input.feedbackType,
        input.tenantId
      );
      logger.info("Updated existing feedback", {
        feedbackId: existingFeedback.id,
        analysisId: input.analysisId,
        oldType: existingFeedback.feedbackType,
        newType: input.feedbackType,
      });
      return { feedback: updatedFeedback, wasUpdated: true };
    }

    const newFeedback = await createAnalysisFeedback(input);
    return { feedback: newFeedback, wasUpdated: false };
  } catch (error) {
    logger.error("Failed to create or update analysis feedback", {
      analysisId: input.analysisId,
      userId: input.userId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Gets existing Q&A feedback for a user on a specific query.
 * Used for deduplication - prevents duplicate votes.
 *
 * @param queryId - Q&A query ID
 * @param userId - User ID (Slack user ID)
 * @returns Existing feedback record or null
 * @throws ValidationError if queryId or userId is empty
 * @throws Error if database operation fails
 */
export const getQAFeedbackByQueryAndUser = async (
  queryId: string,
  userId: string,
  tenantId: string
): Promise<FeedbackRecord | null> => {
  validateNonEmptyString(queryId, "queryId");
  validateNonEmptyString(userId, "userId");
  validateNonEmptyString(tenantId, "tenantId");

  try {
    const result = await query<FeedbackRow>(FEEDBACK_QUERIES.GET_QA_FEEDBACK_BY_QUERY, [
      queryId,
      userId,
      tenantId,
    ]);
    return result.rows.length > 0 ? mapRowToFeedback(result.rows[0]) : null;
  } catch (error) {
    logger.error("Failed to get Q&A feedback by query and user", {
      queryId,
      userId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Creates Q&A feedback for a knowledge base search.
 *
 * @param input - Q&A feedback data
 * @returns The created feedback record
 * @throws ValidationError if input is invalid
 * @throws Error if database operation fails
 */
export const createQAFeedback = async (input: CreateQAFeedbackInput): Promise<FeedbackRecord> => {
  validateQAFeedbackInput(input);

  const id = generateEventId();

  try {
    const result = await query<FeedbackRow>(FEEDBACK_QUERIES.INSERT_QA_FEEDBACK, [
      id,
      input.queryId,
      input.feedbackType,
      input.query,
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
  } catch (error) {
    logger.error("Failed to create Q&A feedback", {
      queryId: input.queryId,
      feedbackType: input.feedbackType,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

/**
 * Creates or updates Q&A feedback with deduplication.
 * If user already voted on this query, updates their vote.
 *
 * @param input - Q&A feedback data
 * @returns Object with feedback record and whether it was updated vs created
 * @throws ValidationError if input is invalid
 * @throws Error if database operation fails
 */
export const createOrUpdateQAFeedback = async (
  input: CreateQAFeedbackInput
): Promise<{ feedback: FeedbackRecord; wasUpdated: boolean }> => {
  validateQAFeedbackInput(input);

  try {
    const existingFeedback = await getQAFeedbackByQueryAndUser(
      input.queryId,
      input.userId,
      input.tenantId
    );

    if (existingFeedback !== null) {
      const updatedFeedback = await updateFeedbackType(
        existingFeedback.id,
        input.feedbackType,
        input.tenantId
      );
      logger.info("Updated existing Q&A feedback", {
        feedbackId: existingFeedback.id,
        queryId: input.queryId,
        oldType: existingFeedback.feedbackType,
        newType: input.feedbackType,
      });
      return { feedback: updatedFeedback, wasUpdated: true };
    }

    const newFeedback = await createQAFeedback(input);
    return { feedback: newFeedback, wasUpdated: false };
  } catch (error) {
    logger.error("Failed to create or update Q&A feedback", {
      queryId: input.queryId,
      userId: input.userId,
      error: getErrorMessage(error),
    });
    throw error;
  }
};
