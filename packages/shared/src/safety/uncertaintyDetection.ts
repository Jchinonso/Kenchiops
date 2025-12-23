/**
 * Uncertainty detection module for confidence scoring.
 * Detects hedging language and uncertainty markers in LLM outputs.
 */

import { UNCERTAINTY_PENALTIES, UNCERTAINTY_PATTERNS } from "../constants.js";

/**
 * Detects hedging language and uncertainty markers in text.
 * Returns penalty value (negative number) based on detected uncertainty.
 *
 * @param text - Text to analyze for uncertainty markers
 * @returns Penalty value (0 to -0.3)
 */
export const detectUncertainty = (text: string): number => {
  if (!text || text.trim().length === 0) {
    return 0;
  }

  const normalizedText = text.toLowerCase();

  // Find first matching pattern (patterns ordered by severity, strongest first)
  const matchedPattern = UNCERTAINTY_PATTERNS.find(({ pattern }) =>
    pattern.test(normalizedText)
  );

  // Return matched penalty or 0, capped at maximum
  const penalty = matchedPattern?.penalty ?? 0;
  return Math.max(penalty, UNCERTAINTY_PENALTIES.MAX);
};
