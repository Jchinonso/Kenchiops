/**
 * Shared utilities for confidence score validation and manipulation.
 */

/**
 * Validates and clamps confidence score to valid range [0, 1].
 * Handles edge cases: NaN, Infinity, negative, > 1.
 * 
 * @param score - Raw confidence score
 * @returns Clamped confidence score (0-1)
 */
export const clampConfidenceScore = (score: number): number => {
  // Handle invalid numbers
  if (!Number.isFinite(score)) {
    return 0; // Default to lowest confidence for invalid input
  }
  
  // Clamp to valid range [0, 1]
  return Math.max(0, Math.min(1, score));
};

