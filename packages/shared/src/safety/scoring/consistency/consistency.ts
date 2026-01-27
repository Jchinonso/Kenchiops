/**
 * Main consistency checking functions.
 * Evaluates whether recommended actions address the identified root cause.
 *
 * @module safety/scoring/consistency/consistency
 */

import type { LLMAnalysisResult } from "../../../core/types.js";
import type { ConsistencyEvaluation } from "../../types.js";
import { CONSISTENCY_ADJUSTMENTS } from "../../../constants/index.js";
import { normalizeText, tokenize } from "../../helpers.js";

// Import validation to ensure config is validated at module load
import "./validation.js";

// Import calculation functions
import { calculateRelevance } from "./relevance.js";
import { determineAdjustment } from "./adjustment.js";

// ==================== Main Functions ====================

/**
 * Evaluates consistency between identified cause and recommended actions.
 * Returns detailed evaluation result for debugging and testing.
 *
 * Scoring logic:
 * - Missing data (no cause or actions) → MISSING_DATA penalty (-0.05)
 * - Shotgun list (≥4 actions, low ratio, effectiveRelevant ≤1) → SHOTGUN_NO_RELEVANCE (-0.15)
 * - High relevance (≥50% relevant) → HIGH_RELEVANCE bonus (+0.05)
 * - Generic-only (0 relevant, some generic) → GENERIC_ONLY (-0.05)
 * - No relevance (0 relevant, 0 generic) → NO_RELEVANCE penalty (-0.1)
 * - Partial relevance → PARTIAL_RELEVANCE (0)
 *
 * @param analysis - LLM analysis result
 * @returns Detailed consistency evaluation with adjustment, relevance metrics, and decision branch
 */
export const evaluateConsistency = (analysis: LLMAnalysisResult): ConsistencyEvaluation => {
  // Missing data: can't verify consistency without cause or actions
  if (!analysis.identifiedCause || !analysis.recommendedActions?.length) {
    return {
      adjustment: CONSISTENCY_ADJUSTMENTS.MISSING_DATA,
      relevance: null,
      decision: "missing_data",
    };
  }

  // Normalize and tokenize cause once
  const normalizedCause = normalizeText(analysis.identifiedCause);
  const causeTokens = tokenize(normalizedCause);

  // Empty cause after normalization (whitespace-only)
  if (causeTokens.length === 0) {
    return {
      adjustment: CONSISTENCY_ADJUSTMENTS.MISSING_DATA,
      relevance: null,
      decision: "missing_data",
    };
  }

  // Calculate relevance metrics
  const relevance = calculateRelevance(causeTokens, analysis.recommendedActions);

  // Determine adjustment based on relevance
  const { adjustment, decision } = determineAdjustment(relevance);

  return { adjustment, relevance, decision };
};

/**
 * Checks consistency between identified cause and recommended actions.
 * Simple wrapper around evaluateConsistency that returns just the adjustment.
 *
 * @param analysis - LLM analysis result
 * @returns Consistency adjustment (bounded by FACTOR_BOUNDS.consistency)
 */
export const checkConsistency = (analysis: LLMAnalysisResult): number =>
  evaluateConsistency(analysis).adjustment;
