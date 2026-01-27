/**
 * Action relevance checking for consistency scoring.
 * Determines if actions address the identified root cause.
 *
 * @module safety/scoring/consistency/relevance
 */

import type { LLMAnalysisResult } from "../../../core/types.js";
import type { NormalizedRule, RelevanceResult } from "../../types.js";
import { RELEVANCE_RULES, GENERIC_REMEDIATION_KEYWORDS } from "../../../constants/index.js";
import { normalizeText, tokenize, tokensContainAny } from "../../helpers.js";
import { normalizeAndValidateKeyword } from "./helpers.js";

// ==================== Precomputed Normalized Rules ====================

/**
 * Precompute normalized rules at module init.
 * Validates each keyword is still a single token after normalization.
 * This catches config mistakes early (at module load, not at runtime).
 */
export const NORMALIZED_RULES: readonly NormalizedRule[] = RELEVANCE_RULES.map(
  (rule, ruleIndex) => ({
    causeKeywords: rule.causeKeywords.map((keyword) =>
      normalizeAndValidateKeyword(keyword, `RELEVANCE_RULES[${ruleIndex}] causeKeyword`)
    ),
    actionKeywords: rule.actionKeywords.map((keyword) =>
      normalizeAndValidateKeyword(keyword, `RELEVANCE_RULES[${ruleIndex}] actionKeyword`)
    ),
  })
);

/**
 * Precomputed normalized generic remediation keywords.
 * Validates each keyword is still a single token after normalization.
 */
export const NORMALIZED_GENERIC_KEYWORDS: readonly string[] = GENERIC_REMEDIATION_KEYWORDS.map(
  (keyword, index) => normalizeAndValidateKeyword(keyword, `GENERIC_REMEDIATION_KEYWORDS[${index}]`)
);

// ==================== Action Relevance Checking ====================

/**
 * Checks if action matches cause based on relevance rules.
 * Uses token-based matching to avoid substring false positives.
 *
 * @param causeTokens - Tokenized root cause text
 * @param actionTokens - Combined tokens from action description and type
 * @returns True if action is relevant to the cause
 */
export const isActionRelevant = (
  causeTokens: readonly string[],
  actionTokens: readonly string[]
): boolean => {
  for (const rule of NORMALIZED_RULES) {
    const causeMatches = tokensContainAny(causeTokens, rule.causeKeywords);
    const actionMatches = tokensContainAny(actionTokens, rule.actionKeywords);

    if (causeMatches && actionMatches) {
      return true;
    }
  }

  return false;
};

/**
 * Checks if action is a generic remediation action.
 * Provides partial credit for common actions like "check logs", "restart".
 *
 * @param actionTokens - Combined tokens from action description and type
 * @returns True if action is a generic remediation action
 */
export const isGenericRemediation = (actionTokens: readonly string[]): boolean =>
  tokensContainAny(actionTokens, NORMALIZED_GENERIC_KEYWORDS);

// ==================== Relevance Calculation ====================

/**
 * Weight for generic actions in effective relevance calculation.
 * Generic actions count at half weight compared to specifically relevant actions.
 */
const GENERIC_ACTION_WEIGHT = 0.5;

/**
 * Calculates relevance metrics between actions and cause.
 *
 * @param causeTokens - Tokenized root cause
 * @param actions - Array of recommended actions
 * @returns Relevance metrics
 */
export const calculateRelevance = (
  causeTokens: readonly string[],
  actions: NonNullable<LLMAnalysisResult["recommendedActions"]>
): RelevanceResult => {
  let relevantCount = 0;
  let genericCount = 0;

  for (const action of actions) {
    const actionText = normalizeText(`${action.description} ${action.actionType}`);
    const actionTokens = tokenize(actionText);

    if (isActionRelevant(causeTokens, actionTokens)) {
      relevantCount++;
    } else if (isGenericRemediation(actionTokens)) {
      genericCount++;
    }
  }

  const effectiveRelevant = relevantCount + genericCount * GENERIC_ACTION_WEIGHT;
  const ratio = effectiveRelevant / actions.length;

  return {
    ratio,
    relevantCount,
    genericCount,
    effectiveRelevant,
    totalCount: actions.length,
  };
};
