/**
 * Adjustment determination for consistency scoring.
 * Maps relevance metrics to confidence adjustments using decision table.
 *
 * @module safety/scoring/consistency/adjustment
 */

import type { RelevanceResult } from "../../types.js";
import type { AdjustmentResult, DecisionRule } from "./types.js";
import {
  CONSISTENCY_ADJUSTMENTS,
  RELEVANCE_THRESHOLDS,
  SHOTGUN_LIST_THRESHOLDS,
} from "../../../constants/index.js";

// ==================== Matchers ====================

/**
 * Checks if actions represent a "shotgun approach" - many actions with low relevance.
 */
export const isShotgunApproach = (relevance: RelevanceResult): boolean =>
  relevance.totalCount >= SHOTGUN_LIST_THRESHOLDS.MIN_ACTIONS &&
  relevance.ratio <= SHOTGUN_LIST_THRESHOLDS.MAX_RELEVANCE_RATIO &&
  relevance.effectiveRelevant <= SHOTGUN_LIST_THRESHOLDS.MAX_EFFECTIVE_RELEVANT;

const isHighRelevance = (relevance: RelevanceResult): boolean =>
  relevance.ratio >= RELEVANCE_THRESHOLDS.MIN_FOR_POSITIVE;

const isGenericOnly = (relevance: RelevanceResult): boolean =>
  relevance.relevantCount === 0 && relevance.genericCount > 0;

const isNoRelevance = (relevance: RelevanceResult): boolean =>
  relevance.relevantCount === 0 && relevance.genericCount === 0;

// ==================== Decision Table ====================

/**
 * Decision rules evaluated in order. First match wins.
 *
 * Order matters:
 * 1. Shotgun (many actions, low relevance) - worst case
 * 2. High relevance (≥50%) - bonus
 * 3. Generic-only (0 relevant, some generic) - mild penalty
 * 4. No relevance (0 relevant, 0 generic) - penalty
 * 5. Partial relevance - neutral (default)
 */
const DECISION_RULES: readonly DecisionRule[] = [
  {
    matches: isShotgunApproach,
    adjustment: CONSISTENCY_ADJUSTMENTS.SHOTGUN_NO_RELEVANCE,
    decision: "shotgun",
  },
  {
    matches: isHighRelevance,
    adjustment: CONSISTENCY_ADJUSTMENTS.HIGH_RELEVANCE,
    decision: "high_relevance",
  },
  {
    matches: isGenericOnly,
    adjustment: CONSISTENCY_ADJUSTMENTS.GENERIC_ONLY,
    decision: "generic_only",
  },
  {
    matches: isNoRelevance,
    adjustment: CONSISTENCY_ADJUSTMENTS.NO_RELEVANCE,
    decision: "no_relevance",
  },
];

const DEFAULT_RESULT: AdjustmentResult = {
  adjustment: CONSISTENCY_ADJUSTMENTS.PARTIAL_RELEVANCE,
  decision: "partial_relevance",
};

// ==================== Adjustment Determination ====================

/**
 * Determines consistency adjustment based on relevance metrics.
 * Evaluates decision rules in order; first match wins.
 *
 * @param relevance - Relevance calculation result
 * @returns Adjustment value and decision branch name
 */
export const determineAdjustment = (relevance: RelevanceResult): AdjustmentResult => {
  for (const rule of DECISION_RULES) {
    if (rule.matches(relevance)) {
      return { adjustment: rule.adjustment, decision: rule.decision };
    }
  }
  return DEFAULT_RESULT;
};
