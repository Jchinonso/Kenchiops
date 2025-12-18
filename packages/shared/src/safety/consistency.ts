/**
 * Consistency checking module for confidence scoring.
 * Ensures recommended actions address the identified root cause.
 */

import type { LLMAnalysisResult } from '../types.js';

/**
 * Cause-action relevance mapping configuration.
 */
type RelevanceRule = {
  readonly causeKeywords: readonly string[];
  readonly actionKeywords: readonly string[];
};

/**
 * Relevance rules for matching causes to actions.
 */
const RELEVANCE_RULES: Readonly<RelevanceRule[]> = [
  {
    causeKeywords: ['secret', 'env'],
    actionKeywords: ['environment'],
  },
  {
    causeKeywords: ['deploy'],
    actionKeywords: ['rollback'],
  },
  {
    causeKeywords: ['config'],
    actionKeywords: ['configuration'],
  },
  {
    causeKeywords: ['test'],
    actionKeywords: ['rerun', 'test'],
  },
  {
    causeKeywords: ['pipeline'],
    actionKeywords: ['rerun', 'pipeline'],
  },
] as const;

/**
 * Consistency adjustment values.
 */
const CONSISTENCY_ADJUSTMENTS = {
  HIGH_RELEVANCE: 0.05, // At least 50% actions relevant
  NO_RELEVANCE: -0.1,   // No actions relevant
  DEFAULT: 0,
} as const;

/**
 * Minimum relevance ratio for positive score.
 */
const MIN_RELEVANCE_RATIO = 0.5;

/**
 * Checks if action matches cause based on relevance rules.
 */
const isActionRelevant = (
  cause: string,
  actionDesc: string,
  actionType: string
): boolean => {
  const normalizedCause = cause.toLowerCase();
  const normalizedDesc = actionDesc.toLowerCase();
  const normalizedType = actionType.toLowerCase();

  return RELEVANCE_RULES.some((rule) => {
    const causeMatches = rule.causeKeywords.some((keyword) =>
      normalizedCause.includes(keyword)
    );
    
    if (!causeMatches) {
      return false;
    }

    return rule.actionKeywords.some(
      (keyword) =>
        normalizedType.includes(keyword) || normalizedDesc.includes(keyword)
    );
  });
};

/**
 * Checks consistency between identified cause and recommended actions.
 * 
 * @param analysis - LLM analysis result
 * @returns Consistency adjustment (-0.1 to 0.05)
 */
export const checkConsistency = (analysis: LLMAnalysisResult): number => {
  if (!analysis.identifiedCause || !analysis.recommendedActions?.length) {
    return CONSISTENCY_ADJUSTMENTS.DEFAULT;
  }

  const cause = analysis.identifiedCause.toLowerCase();
  const actions = analysis.recommendedActions;

  // Count relevant actions
  const relevantActions = actions.filter((action) =>
    isActionRelevant(cause, action.description, action.actionType)
  ).length;

  const relevanceRatio = relevantActions / actions.length;

  if (relevanceRatio >= MIN_RELEVANCE_RATIO) {
    return CONSISTENCY_ADJUSTMENTS.HIGH_RELEVANCE;
  }
  
  if (relevanceRatio === 0) {
    return CONSISTENCY_ADJUSTMENTS.NO_RELEVANCE;
  }

  return CONSISTENCY_ADJUSTMENTS.DEFAULT;
};

/**
 * Determines gating decision based on confidence score.
 */