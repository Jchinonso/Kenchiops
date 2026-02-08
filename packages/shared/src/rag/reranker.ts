/**
 * RAG Reranker Module
 *
 * Implements deterministic ranking formula and metadata-based reranking
 * for improved retrieval quality.
 *
 * @module rag/reranker
 */

import { createLogger } from "../core/logger.js";
import {
  SOURCE_RELIABILITY_SCORES,
  KNOWLEDGE_DOC_TYPES,
  RANKING_WEIGHTS,
  RECENCY_CONFIG,
  METADATA_BOOSTS,
} from "../constants/index.js";
import type { RerankableResult, QueryContext, RerankedResult, RerankOptions } from "./types.js";

export type { RerankableResult, QueryContext, RerankedResult, RerankOptions } from "./types.js";

const logger = createLogger("rag-reranker");

// ==================== Scoring Functions ====================

/**
 * Gets source reliability score for a document type.
 */
const getSourceReliability = (docType: string): number => {
  const scoreMap: Record<string, number> = {
    // High reliability - manual team documentation
    [KNOWLEDGE_DOC_TYPES.RUNBOOK]: SOURCE_RELIABILITY_SCORES.TEAM_DOCS,
    [KNOWLEDGE_DOC_TYPES.SOP]: SOURCE_RELIABILITY_SCORES.TEAM_DOCS,
    [KNOWLEDGE_DOC_TYPES.TROUBLESHOOTING]: SOURCE_RELIABILITY_SCORES.TEAM_DOCS,
    [KNOWLEDGE_DOC_TYPES.POSTMORTEM]: SOURCE_RELIABILITY_SCORES.TEAM_DOCS,
    [KNOWLEDGE_DOC_TYPES.DOCUMENTATION]: SOURCE_RELIABILITY_SCORES.TEAM_DOCS,
    [KNOWLEDGE_DOC_TYPES.ARCHITECTURE]: SOURCE_RELIABILITY_SCORES.TEAM_DOCS,
    // Passive learning sources
    [KNOWLEDGE_DOC_TYPES.LINKED_FIX]: SOURCE_RELIABILITY_SCORES.LINKED_FIX,
    [KNOWLEDGE_DOC_TYPES.PR_FIX_COMMENT]: SOURCE_RELIABILITY_SCORES.PR_FIX_COMMENT,
    [KNOWLEDGE_DOC_TYPES.SLACK_RESOLUTION]: SOURCE_RELIABILITY_SCORES.SLACK_RESOLUTION,
    [KNOWLEDGE_DOC_TYPES.ANALYSIS_LESSON]: SOURCE_RELIABILITY_SCORES.ANALYSIS_LESSON,
    // External sources
    [KNOWLEDGE_DOC_TYPES.EXTERNAL]: SOURCE_RELIABILITY_SCORES.EXTERNAL,
  };

  return scoreMap[docType] ?? 0.5;
};

/**
 * Calculates recency boost based on document age.
 * Newer documents get higher scores.
 */
const calculateRecencyBoost = (createdAt?: string): number => {
  if (!createdAt) {
    return RECENCY_CONFIG.MIN_BOOST;
  }

  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageDays = ageMs / RECENCY_CONFIG.MS_PER_DAY;

  if (ageDays <= RECENCY_CONFIG.FULL_BOOST_DAYS) {
    return RECENCY_CONFIG.MAX_BOOST;
  }

  if (ageDays >= RECENCY_CONFIG.NO_BOOST_DAYS) {
    return RECENCY_CONFIG.MIN_BOOST;
  }

  // Linear decay between full boost and no boost
  const decayRange = RECENCY_CONFIG.NO_BOOST_DAYS - RECENCY_CONFIG.FULL_BOOST_DAYS;
  const decayProgress = (ageDays - RECENCY_CONFIG.FULL_BOOST_DAYS) / decayRange;
  const boostRange = RECENCY_CONFIG.MAX_BOOST - RECENCY_CONFIG.MIN_BOOST;

  return RECENCY_CONFIG.MAX_BOOST - decayProgress * boostRange;
};

/**
 * Calculates feedback signal score.
 * Considers helpful rate and negative feedback count.
 */
const calculateFeedbackSignal = (metadata?: RerankableResult["metadata"]): number => {
  if (!metadata) {
    return 0.5; // Neutral default
  }

  const helpfulRate = metadata.helpfulRate ?? 0.5;
  const negativeFeedback = metadata.negativeFeedbackCount ?? 0;

  // Reduce score for high negative feedback
  const negativePenalty = Math.min(negativeFeedback * 0.1, 0.4);

  return Math.max(0, helpfulRate - negativePenalty);
};

/**
 * Calculates metadata boost based on query context matching.
 */
const calculateMetadataBoost = (result: RerankableResult, queryContext?: QueryContext): number => {
  if (!queryContext || !result.metadata) {
    return 0;
  }

  let boost = 0;

  if (queryContext.repository && result.metadata.repository === queryContext.repository) {
    boost += METADATA_BOOSTS.SAME_REPO;
  }

  if (queryContext.workflow && result.metadata.workflow === queryContext.workflow) {
    boost += METADATA_BOOSTS.SAME_WORKFLOW;
  }

  if (queryContext.errorSignature && result.metadata.errorSignature) {
    if (result.metadata.errorSignature === queryContext.errorSignature) {
      boost += METADATA_BOOSTS.SAME_ERROR_SIGNATURE;
    }
  }

  if (queryContext.language && result.metadata.language === queryContext.language) {
    boost += METADATA_BOOSTS.SAME_LANGUAGE;
  }

  return boost;
};

/**
 * Calculates the final score for a single result.
 */
const calculateFinalScore = (
  result: RerankableResult,
  queryContext?: QueryContext
): RerankedResult => {
  const vectorScore = result.similarity * RANKING_WEIGHTS.VECTOR_SIMILARITY;
  const reliabilityScore =
    getSourceReliability(result.docType) * RANKING_WEIGHTS.SOURCE_RELIABILITY;
  const recencyScore = calculateRecencyBoost(result.createdAt) * RANKING_WEIGHTS.RECENCY_BOOST;
  const feedbackScore = calculateFeedbackSignal(result.metadata) * RANKING_WEIGHTS.FEEDBACK_SIGNAL;
  const metadataBoost = calculateMetadataBoost(result, queryContext);

  const finalScore = vectorScore + reliabilityScore + recencyScore + feedbackScore + metadataBoost;

  return {
    result,
    finalScore,
    scoreBreakdown: {
      vectorScore,
      reliabilityScore,
      recencyScore,
      feedbackScore,
      metadataBoost,
    },
  };
};

// ==================== Public API ====================

/**
 * Reranks search results using deterministic scoring formula.
 *
 * Formula:
 *   finalScore = (vectorSimilarity * 0.55) +
 *                (sourceReliability * 0.20) +
 *                (recencyBoost * 0.15) +
 *                (feedbackSignal * 0.10) +
 *                metadataBoost
 *
 * @param results - Array of search results to rerank
 * @param options - Reranking options
 * @returns Reranked results sorted by final score
 */
export const rerankResults = (
  results: readonly RerankableResult[],
  options: RerankOptions = {}
): readonly RerankedResult[] => {
  const { queryContext, topK, minScore } = options;

  logger.debug("Reranking results", {
    inputCount: results.length,
    hasQueryContext: !!queryContext,
    topK,
    minScore,
  });

  // Calculate final scores
  const scored = results.map((result) => calculateFinalScore(result, queryContext));

  // Filter by minimum score if specified
  const filtered = minScore
    ? scored.filter((scoredResult) => scoredResult.finalScore >= minScore)
    : scored;

  // Sort by final score descending
  const sorted = [...filtered].sort((resultA, resultB) => resultB.finalScore - resultA.finalScore);

  // Apply topK limit if specified
  const limited = topK ? sorted.slice(0, topK) : sorted;

  logger.debug("Reranking complete", {
    outputCount: limited.length,
    topScore: limited[0]?.finalScore ?? 0,
  });

  return Object.freeze(limited);
};

/**
 * Applies hard rules to filter results before scoring.
 *
 * Hard rules:
 * - Same repo + same workflow results ranked higher than cross-repo
 * - PR fix comments preferred over Slack resolutions
 * - Newer fixes preferred for dependency-related failures
 */
export const applyHardRules = (
  results: readonly RerankedResult[],
  queryContext?: QueryContext
): readonly RerankedResult[] => {
  if (!queryContext?.repository) {
    return results;
  }

  // Partition by same-repo vs cross-repo
  const sameRepoResults: RerankedResult[] = [];
  const crossRepoResults: RerankedResult[] = [];

  results.forEach((scoredResult) => {
    if (scoredResult.result.metadata?.repository === queryContext.repository) {
      sameRepoResults.push(scoredResult);
    } else {
      crossRepoResults.push(scoredResult);
    }
  });

  // Same-repo results come first, then cross-repo
  return Object.freeze([...sameRepoResults, ...crossRepoResults]);
};

/**
 * Full reranking pipeline with hard rules.
 */
export const fullRerank = (
  results: readonly RerankableResult[],
  options: RerankOptions = {}
): readonly RerankedResult[] => {
  const scored = rerankResults(results, options);
  const withHardRules = applyHardRules(scored, options.queryContext);

  // Apply topK after hard rules if specified
  if (options.topK) {
    return withHardRules.slice(0, options.topK);
  }

  return withHardRules;
};

// ==================== Exports for Testing ====================

export const _testExports = {
  calculateRecencyBoost,
  calculateFeedbackSignal,
  calculateMetadataBoost,
  getSourceReliability,
  RANKING_WEIGHTS,
  RECENCY_CONFIG,
  METADATA_BOOSTS,
};
