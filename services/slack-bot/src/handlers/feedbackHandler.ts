/**
 * Handlers for Slack feedback button interactions.
 * Processes positive/negative feedback and RAG relevance feedback.
 * Uses deduplication to prevent duplicate votes per user per analysis.
 */

import type { ButtonAction } from "@slack/bolt";
import {
  createLogger,
  createOrUpdateAnalysisFeedback,
  createOrUpdateQAFeedback,
  findTenantBySlackWorkspace,
  getErrorMessage,
  ingestAnalysisLesson,
  extractAnalysisContext,
  recordRAGFeedback,
  UI_EMOJI,
  type AnalysisFeedbackType,
  type RAGRelevance,
} from "@kenchi/shared";
import { getAnalysisContext, deleteAnalysisContext } from "../services/analysisContextStore.js";
import type {
  RespondFunction,
  AckFunction,
  RAGFeedbackButtonValue,
} from "./feedbackHandlerTypes.js";

const logger = createLogger("slack-bot");

// ==================== Helper Functions ====================

/**
 * Resolves tenantId from a Slack workspace ID.
 * Returns "unknown" if resolution fails (fail-open for feedback).
 */
const resolveTenantId = async (workspaceId: string): Promise<string> => {
  try {
    const tenant = await findTenantBySlackWorkspace(workspaceId);
    return tenant?.id ?? "unknown";
  } catch (error) {
    logger.warn("Failed to resolve tenant for feedback", {
      workspaceId,
      error: getErrorMessage(error),
    });
    return "unknown";
  }
};

/**
 * Persists analysis feedback to the database with deduplication.
 * If user already voted, updates their vote instead of creating duplicate.
 *
 * @returns Whether the feedback was updated (true) or newly created (false)
 */
const persistAnalysisFeedback = async (
  analysisId: string,
  feedbackType: AnalysisFeedbackType,
  userId: string,
  tenantId: string
): Promise<boolean> => {
  try {
    const result = await createOrUpdateAnalysisFeedback({
      analysisId,
      feedbackType,
      userId,
      tenantId,
    });
    logger.debug("Analysis feedback persisted", {
      analysisId,
      feedbackType,
      wasUpdated: result.wasUpdated,
    });
    return result.wasUpdated;
  } catch (error: unknown) {
    logger.warn("Failed to persist analysis feedback", {
      analysisId,
      feedbackType,
      error: getErrorMessage(error),
    });
    return false;
  }
};

/**
 * Extracts and ingests analysis lesson in the background (fire-and-forget).
 */
const extractLessonInBackground = (analysisId: string, confirmedBy: string): void => {
  const doExtraction = async (): Promise<void> => {
    const storedContext = getAnalysisContext(analysisId);

    if (!storedContext) {
      logger.debug("No stored context for lesson extraction", { analysisId });
      return;
    }

    const lessonContext = extractAnalysisContext(storedContext.aggregation, confirmedBy);

    try {
      const result = await ingestAnalysisLesson(lessonContext);

      if (result.success && result.lessonsCreated > 0) {
        logger.info("Analysis lesson extracted from positive feedback", {
          analysisId,
          lessonsCreated: result.lessonsCreated,
          chunksCreated: result.ingestionResult?.chunksCreated,
        });

        // Remove context after successful extraction
        deleteAnalysisContext(analysisId);
      }
    } catch (extractionError) {
      logger.warn("Failed to extract analysis lesson", {
        analysisId,
        error: getErrorMessage(extractionError),
      });
    }
  };

  // Fire and forget - don't block feedback acknowledgment
  void doExtraction();
};

/**
 * Parses RAG feedback button value from JSON string.
 */
const parseRAGFeedbackValue = (valueString: string | undefined): RAGFeedbackButtonValue | null => {
  if (!valueString) {
    return null;
  }
  try {
    const parsed = JSON.parse(valueString) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "analysisId" in parsed &&
      "knowledgeDocId" in parsed &&
      "similarity" in parsed &&
      "rank" in parsed
    ) {
      return parsed as RAGFeedbackButtonValue;
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Records RAG feedback with the given relevance level.
 */
const recordRAGFeedbackWithRelevance = async (
  feedbackValue: RAGFeedbackButtonValue,
  relevance: RAGRelevance,
  userId: string
): Promise<void> => {
  const result = await recordRAGFeedback({
    analysisId: feedbackValue.analysisId,
    knowledgeDocId: feedbackValue.knowledgeDocId,
    relevance,
    retrievalSimilarity: feedbackValue.similarity,
    retrievalRank: feedbackValue.rank,
    userId,
  });

  if (!result.success) {
    logger.warn("Failed to record RAG feedback", { error: result.error });
  }
};

// ==================== Analysis Feedback Handlers ====================

/**
 * Handles positive feedback.
 * Sends ephemeral confirmation to prevent duplicate clicks.
 * Uses deduplication - if user already voted, updates their vote.
 */
export const handlePositiveFeedback = async (
  action: ButtonAction,
  ack: AckFunction,
  userId: string,
  respond?: RespondFunction,
  workspaceId?: string
): Promise<void> => {
  await ack();

  const analysisId = action.value ?? "";
  logger.info("Positive feedback received", { analysisId, userId });

  const tenantId = workspaceId ? await resolveTenantId(workspaceId) : "unknown";
  const wasUpdated = await persistAnalysisFeedback(analysisId, "correct", userId, tenantId);

  // Send ephemeral confirmation to user
  if (respond) {
    await respond({
      text: `${UI_EMOJI.success} Thanks for the feedback! This analysis has been marked as helpful and will be used to improve future suggestions.`,
      replace_original: false,
      response_type: "ephemeral",
    });
  }

  // Trigger lesson extraction in background (only for new positive feedback)
  if (!wasUpdated) {
    extractLessonInBackground(analysisId, userId);
  }
};

/**
 * Handles negative feedback.
 * Sends ephemeral confirmation to prevent duplicate clicks.
 * Uses deduplication - if user already voted, updates their vote.
 */
export const handleNegativeFeedback = async (
  action: ButtonAction,
  ack: AckFunction,
  userId: string,
  respond?: RespondFunction,
  workspaceId?: string
): Promise<void> => {
  await ack();

  const analysisId = action.value ?? "";
  logger.info("Negative feedback received", { analysisId, userId });

  const tenantId = workspaceId ? await resolveTenantId(workspaceId) : "unknown";
  await persistAnalysisFeedback(analysisId, "incorrect", userId, tenantId);

  // Send ephemeral confirmation to user
  if (respond) {
    await respond({
      text: `${UI_EMOJI.commit} Thanks for the feedback! We'll use this to improve our analysis accuracy.`,
      replace_original: false,
      response_type: "ephemeral",
    });
  }
};

// ==================== RAG Feedback Handlers ====================

/**
 * Handles RAG helpful feedback button.
 */
export const handleRAGFeedbackHelpful = async (
  action: ButtonAction,
  ack: AckFunction,
  userId: string
): Promise<void> => {
  await ack();

  const feedbackValue = parseRAGFeedbackValue(action.value);
  if (!feedbackValue) {
    logger.warn("Invalid RAG feedback button value", { value: action.value });
    return;
  }

  logger.info("RAG helpful feedback received", {
    analysisId: feedbackValue.analysisId,
    knowledgeDocId: feedbackValue.knowledgeDocId,
    userId,
  });

  await recordRAGFeedbackWithRelevance(feedbackValue, "helpful", userId);
};

/**
 * Handles RAG not helpful feedback button.
 */
export const handleRAGFeedbackNotHelpful = async (
  action: ButtonAction,
  ack: AckFunction,
  userId: string
): Promise<void> => {
  await ack();

  const feedbackValue = parseRAGFeedbackValue(action.value);
  if (!feedbackValue) {
    logger.warn("Invalid RAG feedback button value", { value: action.value });
    return;
  }

  logger.info("RAG not helpful feedback received", {
    analysisId: feedbackValue.analysisId,
    knowledgeDocId: feedbackValue.knowledgeDocId,
    userId,
  });

  await recordRAGFeedbackWithRelevance(feedbackValue, "not_helpful", userId);
};

// ==================== Q&A Feedback Handlers ====================

/**
 * Persists Q&A feedback to the database with deduplication.
 * If user already voted, updates their vote instead of creating duplicate.
 *
 * @returns Whether the feedback was updated (true) or newly created (false)
 */
const persistQAFeedback = async (
  queryId: string,
  feedbackType: "qa_helpful" | "qa_not_helpful",
  userId: string,
  tenantId: string
): Promise<boolean> => {
  try {
    const result = await createOrUpdateQAFeedback({
      queryId,
      query: "", // Query text is not available from button value
      feedbackType,
      userId,
      tenantId,
    });
    logger.debug("Q&A feedback persisted", {
      queryId,
      feedbackType,
      wasUpdated: result.wasUpdated,
    });
    return result.wasUpdated;
  } catch (error: unknown) {
    logger.warn("Failed to persist Q&A feedback", {
      queryId,
      feedbackType,
      error: getErrorMessage(error),
    });
    return false;
  }
};

/**
 * Handles Q&A helpful feedback button.
 * Records that the Q&A results were useful and persists to database.
 */
export const handleQAFeedbackHelpful = async (
  action: ButtonAction,
  ack: AckFunction,
  userId: string,
  respond?: RespondFunction,
  workspaceId?: string
): Promise<void> => {
  await ack();

  const queryId = action.value ?? "";
  logger.info("Q&A helpful feedback received", { queryId, userId });

  const tenantId = workspaceId ? await resolveTenantId(workspaceId) : "unknown";
  await persistQAFeedback(queryId, "qa_helpful", userId, tenantId);

  // Send ephemeral confirmation to user
  if (respond) {
    await respond({
      text: `${UI_EMOJI.success} Thanks! Your feedback helps improve our knowledge base.`,
      replace_original: false,
      response_type: "ephemeral",
    });
  }
};

/**
 * Handles Q&A not helpful feedback button.
 * Records that the Q&A results were not useful and persists to database.
 */
export const handleQAFeedbackNotHelpful = async (
  action: ButtonAction,
  ack: AckFunction,
  userId: string,
  respond?: RespondFunction,
  workspaceId?: string
): Promise<void> => {
  await ack();

  const queryId = action.value ?? "";
  logger.info("Q&A not helpful feedback received", { queryId, userId });

  const tenantId = workspaceId ? await resolveTenantId(workspaceId) : "unknown";
  await persistQAFeedback(queryId, "qa_not_helpful", userId, tenantId);

  // Send ephemeral confirmation to user
  if (respond) {
    await respond({
      text: `${UI_EMOJI.commit} Thanks for letting us know. We'll use this to improve search results.`,
      replace_original: false,
      response_type: "ephemeral",
    });
  }
};
