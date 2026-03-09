/**
 * RAG Evaluation Module
 *
 * Provides utilities for evaluating RAG retrieval quality through:
 * - User feedback collection (helpful/not helpful)
 * - Metrics calculation (Recall@K, MRR)
 * - Feedback aggregation for model improvement
 *
 * @module rag/evaluation
 */

import { createLogger } from "../core/logger.js";
import { getErrorMessage } from "../core/errors.js";
import {
  createRAGFeedback as dbCreateRAGFeedback,
  getRAGFeedbackMetrics as dbGetRAGFeedbackMetrics,
} from "../database/index.js";
import type {
  RAGFeedbackInput,
  RAGEvaluationMetrics,
  RetrievalResult,
  RAGTestCase,
  RAGTestResult,
  FeedbackResult,
  SearchFunction,
} from "./types.js";

export type {
  RAGRelevance,
  RAGFeedbackInput,
  RAGEvaluationMetrics,
  RetrievalResult,
  RAGTestCase,
  RAGTestResult,
  FeedbackResult,
} from "./types.js";

const logger = createLogger("rag-evaluation");

// ==================== Metrics Calculation ====================

/**
 * Calculates Recall@K for a set of retrieval results.
 * Recall@K = (relevant docs in top K) / (total relevant docs)
 *
 * @param results - Retrieval results with relevance labels
 * @param k - Number of top results to consider
 * @returns Recall@K score (0.0 to 1.0)
 */
export const calculateRecallAtK = (results: readonly RetrievalResult[], k: number): number => {
  const totalRelevant = results.filter((result) => result.isRelevant).length;

  if (totalRelevant === 0) {
    return 0;
  }

  const topK = results.slice(0, k);
  const relevantInTopK = topK.filter((result) => result.isRelevant).length;

  return relevantInTopK / totalRelevant;
};

/**
 * Calculates Mean Reciprocal Rank (MRR) for a set of queries.
 * MRR = average of (1 / rank of first relevant result) across queries
 *
 * @param queryResults - Array of retrieval results per query
 * @returns MRR score (0.0 to 1.0)
 */
export const calculateMRR = (queryResults: ReadonlyArray<readonly RetrievalResult[]>): number => {
  if (queryResults.length === 0) {
    return 0;
  }

  const reciprocalRanks = queryResults.map((results) => {
    const firstRelevantRank = results.findIndex((result) => result.isRelevant);
    return firstRelevantRank === -1 ? 0 : 1 / (firstRelevantRank + 1);
  });

  const sum = reciprocalRanks.reduce((accumulator, rank) => accumulator + rank, 0);
  return sum / queryResults.length;
};

/**
 * Calculates helpful rate from feedback data.
 *
 * @param helpfulCount - Number of helpful ratings
 * @param totalCount - Total number of ratings
 * @returns Helpful rate (0.0 to 1.0)
 */
export const calculateHelpfulRate = (helpfulCount: number, totalCount: number): number =>
  totalCount > 0 ? helpfulCount / totalCount : 0;

// ==================== Feedback Recording ====================

/**
 * Validates RAG feedback input.
 */
const validateFeedbackInput = (input: RAGFeedbackInput): string | null => {
  const validators = [
    { condition: !input.analysisId, message: "Analysis ID is required" },
    { condition: !input.knowledgeDocId, message: "Knowledge doc ID is required" },
    { condition: !input.userId, message: "User ID is required" },
    {
      condition: input.retrievalSimilarity < 0 || input.retrievalSimilarity > 1,
      message: "Similarity must be between 0 and 1",
    },
    { condition: input.retrievalRank < 1, message: "Rank must be at least 1" },
  ];

  const failed = validators.find((validator) => validator.condition);
  return failed?.message ?? null;
};

/**
 * Records RAG feedback to database.
 *
 * @param input - Feedback input
 * @returns Promise resolving to success status
 */
export const recordRAGFeedback = async (input: RAGFeedbackInput): Promise<FeedbackResult> => {
  const validationError = validateFeedbackInput(input);

  if (validationError) {
    logger.warn("Invalid RAG feedback input", { error: validationError });
    return { success: false, error: validationError };
  }

  try {
    await dbCreateRAGFeedback({
      analysisId: input.analysisId,
      knowledgeDocId: input.knowledgeDocId,
      ragRelevance: input.relevance,
      retrievalSimilarity: input.retrievalSimilarity,
      retrievalRank: input.retrievalRank,
      userId: input.userId,
      slackChannel: input.slackChannel,
      slackMessageTs: input.slackMessageTs,
    });

    logger.info("RAG feedback recorded successfully", {
      analysisId: input.analysisId,
      knowledgeDocId: input.knowledgeDocId,
      relevance: input.relevance,
    });

    return { success: true };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("Failed to record RAG feedback", { error: errorMessage });
    return { success: false, error: errorMessage };
  }
};

// ==================== Regression Testing ====================

/**
 * Runs a RAG test case and returns results.
 *
 * @param testCase - Test case with query and expected results
 * @param searchFn - Search function to evaluate
 * @returns Test results with metrics
 */
export const runRAGTestCase = async (
  testCase: RAGTestCase,
  searchFn: SearchFunction
): Promise<RAGTestResult> => {
  logger.info("Running RAG test case", { testId: testCase.testId });

  const results = await searchFn(testCase.queryText, testCase.repository);

  // Mark results as relevant if they match expected doc IDs
  const expectedSet = new Set(testCase.expectedDocIds);
  const labeledResults: RetrievalResult[] = results.map((result) => ({
    ...result,
    isRelevant: expectedSet.has(result.docId),
  }));

  const recallAt1 = calculateRecallAtK(labeledResults, 1);
  const recallAt3 = calculateRecallAtK(labeledResults, 3);
  const recallAt5 = calculateRecallAtK(labeledResults, 5);

  // Pass if at least one expected doc is in top 5
  const passed = recallAt5 > 0;

  return {
    testId: testCase.testId,
    passed,
    recallAt1,
    recallAt3,
    recallAt5,
    retrievedDocIds: results.map((result) => result.docId),
  };
};

// ==================== Metrics Aggregation ====================

/**
 * Aggregates RAG metrics from feedback data.
 *
 * @param windowMinutes - Time window in minutes
 * @returns Aggregated metrics
 */
export const getRAGEvaluationMetrics = async (
  tenantId: string,
  windowMinutes: number = 60
): Promise<RAGEvaluationMetrics> => {
  logger.info("Calculating RAG evaluation metrics", { tenantId, windowMinutes });

  try {
    const dbMetrics = await dbGetRAGFeedbackMetrics(tenantId, windowMinutes);

    return {
      totalFeedback: dbMetrics.totalFeedback,
      helpfulCount: dbMetrics.helpfulCount,
      notHelpfulCount: dbMetrics.notHelpfulCount,
      partiallyHelpfulCount: dbMetrics.partiallyHelpfulCount,
      helpfulRate: dbMetrics.helpfulRate,
      recallAtK: { 1: 0, 3: 0, 5: 0 }, // Calculated from test cases, not feedback
      mrr: 0, // Calculated from test cases, not feedback
      averageSimilarity: dbMetrics.averageSimilarity,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error("Failed to get RAG metrics from database", {
      error: getErrorMessage(error),
    });

    // Return zeros on error
    return {
      totalFeedback: 0,
      helpfulCount: 0,
      notHelpfulCount: 0,
      partiallyHelpfulCount: 0,
      helpfulRate: 0,
      recallAtK: { 1: 0, 3: 0, 5: 0 },
      mrr: 0,
      averageSimilarity: 0,
      timestamp: new Date().toISOString(),
    };
  }
};
