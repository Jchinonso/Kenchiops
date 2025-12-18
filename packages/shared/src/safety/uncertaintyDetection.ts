/**
 * Uncertainty detection module for confidence scoring.
 * Detects hedging language and uncertainty markers in LLM outputs.
 */

import { UNCERTAINTY_PENALTIES } from '../constants.js';

/**
 * Uncertainty pattern configuration.
 */
type UncertaintyPattern = {
  readonly pattern: RegExp;
  readonly penalty: number;
};

/**
 * Compiled uncertainty patterns with penalties.
 * Ordered by severity (strongest first).
 */
const UNCERTAINTY_PATTERNS: Readonly<UncertaintyPattern[]> = [
  {
    pattern: /\b(not sure|unclear|cannot determine|insufficient information|unable to identify|unknown)\b/gi,
    penalty: UNCERTAINTY_PENALTIES.STRONG,
  },
  {
    pattern: /\b(possibly|might be|could be|may be|potentially|perhaps)\b/gi,
    penalty: UNCERTAINTY_PENALTIES.MODERATE,
  },
  {
    pattern: /\b(appears to|seems like|suggests that|probably)\b/gi,
    penalty: UNCERTAINTY_PENALTIES.MILD,
  },
] as const;

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
  let totalPenalty = 0;

  // Check patterns in order of severity (strongest first)
  // Early exit on first match to avoid multiple penalties
  for (const { pattern, penalty } of UNCERTAINTY_PATTERNS) {
    if (pattern.test(normalizedText)) {
      totalPenalty = penalty;
      break;
    }
  }

  // Cap total uncertainty penalty
  return Math.max(totalPenalty, UNCERTAINTY_PENALTIES.MAX);
};

/**
 * Factor 2: Checks if analysis aligns with provided evidence.
 */