/**
 * Reasoning formatting for confidence scoring.
 * Generates human-readable explanations of scoring decisions.
 *
 * @module safety/scoring/confidenceScoring/reasoning
 */

import {
  FACTOR_BOUNDS,
  FACTOR_WEIGHTS,
  MAX_WEIGHTED_ADJUSTMENT,
} from "../../../constants/index.js";

// ==================== Impact Range Calculation ====================

/**
 * Computes effective impact range for a factor.
 */
export const computeImpactRange = (
  factorName: keyof typeof FACTOR_BOUNDS
): { min: number; max: number } => ({
  min: FACTOR_BOUNDS[factorName].min * FACTOR_WEIGHTS[factorName],
  max: FACTOR_BOUNDS[factorName].max * FACTOR_WEIGHTS[factorName],
});

// ==================== Factor Contribution Formatting ====================

/**
 * Formats a weighted factor contribution for reasoning.
 * Shows: factor name, weight, bounds, impact range, and actual contribution.
 * All numbers formatted to consistent precision for log readability.
 */
export const formatWeightedContribution = (
  factorName: keyof typeof FACTOR_BOUNDS,
  bounded: number,
  weighted: number
): string => {
  const weight = FACTOR_WEIGHTS[factorName];
  const bounds = FACTOR_BOUNDS[factorName];
  const impact = computeImpactRange(factorName);

  const sign = weighted >= 0 ? "+" : "";
  return `${factorName}: ${sign}${weighted.toFixed(3)} (bounded: ${bounded.toFixed(2)}, weight=${weight.toFixed(2)}, bounds [${bounds.min.toFixed(2)},${bounds.max.toFixed(2)}] → impact [${impact.min.toFixed(2)},${impact.max.toFixed(2)}])`;
};

// ==================== Weighted Adjustment Formatting ====================

/**
 * Formats the weighted adjustment reasoning, indicating if clamping occurred.
 * Uses direct min/max comparison to detect clamping (avoids floating point equality issues).
 */
export const formatWeightedAdjustmentReasoning = (rawSum: number, clampedValue: number): string => {
  const sign = clampedValue >= 0 ? "+" : "";
  // Use direct comparison against bounds (more robust than rawSum !== clampedValue)
  const wasClamped = rawSum < MAX_WEIGHTED_ADJUSTMENT.min || rawSum > MAX_WEIGHTED_ADJUSTMENT.max;

  if (wasClamped) {
    const rawSign = rawSum >= 0 ? "+" : "";
    return `Weighted adjustment: ${sign}${clampedValue.toFixed(3)} (raw sum ${rawSign}${rawSum.toFixed(3)} clamped to [${MAX_WEIGHTED_ADJUSTMENT.min},${MAX_WEIGHTED_ADJUSTMENT.max}])`;
  }

  return `Weighted adjustment: ${sign}${clampedValue.toFixed(3)} (sum of weighted factors)`;
};
