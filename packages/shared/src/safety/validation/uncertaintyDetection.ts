/**
 * Uncertainty detection module for confidence scoring.
 * Detects hedging language and uncertainty markers in LLM outputs.
 *
 * @module safety/validation/uncertaintyDetection
 */

import { UNCERTAINTY_PENALTIES, UNCERTAINTY_PATTERNS } from "../../constants/index.js";
import { INPUT_VALIDATION_LIMITS } from "../../constants/validation.js";

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

  // Truncate input to prevent DoS from very large inputs
  const truncatedText =
    text.length > INPUT_VALIDATION_LIMITS.MAX_UNCERTAINTY_TEXT_LENGTH
      ? text.slice(0, INPUT_VALIDATION_LIMITS.MAX_UNCERTAINTY_TEXT_LENGTH)
      : text;

  const normalizedText = truncatedText.toLowerCase();

  // Find first matching pattern (patterns ordered by severity, strongest first)
  // Reset lastIndex for global patterns to avoid state bugs across calls
  const matchedPattern = UNCERTAINTY_PATTERNS.find(({ pattern }) => {
    pattern.lastIndex = 0;
    return pattern.test(normalizedText);
  });

  // Return matched penalty or 0, capped at maximum
  const penalty = matchedPattern?.penalty ?? 0;
  return Math.max(penalty, UNCERTAINTY_PENALTIES.MAX);
};
