/**
 * Consistency checking module for confidence scoring.
 * Ensures recommended actions address the identified root cause.
 *
 * @module safety/consistency
 */

import type { LLMAnalysisResult } from "../types.js";
import { CONSISTENCY_ADJUSTMENTS, RELEVANCE_THRESHOLDS, RELEVANCE_RULES } from "../constants.js";

/**
 * Checks if action matches cause based on relevance rules.
 * Uses functional pattern with logical AND to avoid if statements.
 *
 * @param cause - Normalized root cause text
 * @param actionDesc - Normalized action description
 * @param actionType - Normalized action type
 * @returns True if action is relevant to the cause
 */
const isActionRelevant = (cause: string, actionDesc: string, actionType: string): boolean => {
  const normalizedCause = cause.toLowerCase();
  const normalizedDesc = actionDesc.toLowerCase();
  const normalizedType = actionType.toLowerCase();

  return RELEVANCE_RULES.some(
    (rule) =>
      rule.causeKeywords.some((keyword) => normalizedCause.includes(keyword)) &&
      rule.actionKeywords.some(
        (keyword) => normalizedType.includes(keyword) || normalizedDesc.includes(keyword)
      )
  );
};

/**
 * Relevance ratio threshold handlers.
 * Each handler checks a condition and returns the corresponding adjustment.
 */
type RelevanceHandler = (ratio: number) => number | null;

/**
 * Handles high relevance ratio (>= threshold).
 */
const handleHighRelevance: RelevanceHandler = (ratio) =>
  ratio >= RELEVANCE_THRESHOLDS.MIN_FOR_POSITIVE ? CONSISTENCY_ADJUSTMENTS.HIGH_RELEVANCE : null;

/**
 * Handles zero relevance ratio.
 */
const handleNoRelevance: RelevanceHandler = (ratio) =>
  ratio === 0 ? CONSISTENCY_ADJUSTMENTS.NO_RELEVANCE : null;

/**
 * Handles default case (returns default adjustment).
 */
const handleDefault: RelevanceHandler = () => CONSISTENCY_ADJUSTMENTS.DEFAULT;

/**
 * Array of relevance handlers in priority order.
 * First matching handler returns its adjustment value.
 */
const RELEVANCE_HANDLERS: ReadonlyArray<RelevanceHandler> = [
  handleHighRelevance,
  handleNoRelevance,
  handleDefault,
] as const;

/**
 * Calculates relevance ratio between actions and cause.
 *
 * @param cause - Normalized root cause
 * @param actions - Array of recommended actions (must be non-empty)
 * @returns Relevance ratio (0 to 1)
 */
const calculateRelevanceRatio = (
  cause: string,
  actions: NonNullable<LLMAnalysisResult["recommendedActions"]>
): number => {
  const relevantActions = actions.filter((action) =>
    isActionRelevant(cause, action.description, action.actionType)
  ).length;
  return relevantActions / actions.length;
};

/**
 * Determines consistency adjustment based on relevance ratio.
 * Uses handler pattern to avoid multiple if statements.
 *
 * @param relevanceRatio - Ratio of relevant actions to total actions
 * @returns Consistency adjustment value
 */
const determineAdjustment = (relevanceRatio: number): number => {
  const matchedResult = RELEVANCE_HANDLERS.map((handler) => handler(relevanceRatio)).find(
    (result) => result !== null
  );
  return matchedResult ?? CONSISTENCY_ADJUSTMENTS.DEFAULT;
};

/**
 * Checks consistency between identified cause and recommended actions.
 * Optimized with functional patterns and handler lookup table.
 *
 * @param analysis - LLM analysis result
 * @returns Consistency adjustment (-0.1 to 0.05)
 */
export const checkConsistency = (analysis: LLMAnalysisResult): number => {
  // Early return for missing data
  if (!analysis.identifiedCause || !analysis.recommendedActions?.length) {
    return CONSISTENCY_ADJUSTMENTS.DEFAULT;
  }

  const cause = analysis.identifiedCause.toLowerCase();
  const relevanceRatio = calculateRelevanceRatio(cause, analysis.recommendedActions);

  return determineAdjustment(relevanceRatio);
};
