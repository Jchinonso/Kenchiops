/**
 * Safety Module Helpers
 *
 * Shared utilities for confidence score validation and manipulation.
 *
 * @module safety/helpers
 */

import { DISPLAY_DEFAULTS } from "../constants/index.js";

// ==================== Score Validation ====================

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

// ==================== Formatting Helpers ====================

/**
 * Formats adjustment value for reasoning output.
 * Returns empty string for zero adjustments.
 *
 * @param value - Adjustment value
 * @param label - Label for the adjustment
 * @returns Formatted string or empty if zero
 */
export const formatAdjustment = (value: number, label: string): string => {
  if (value === 0) {
    return "";
  }

  const sign = value > 0 ? "+" : "";
  return `${label}: ${sign}${value.toFixed(DISPLAY_DEFAULTS.SCORE_DECIMAL_PRECISION)}`;
};

/**
 * Formats a score with fixed decimal precision.
 *
 * @param score - Score value
 * @returns Formatted score string
 */
export const formatScore = (score: number): string =>
  score.toFixed(DISPLAY_DEFAULTS.SCORE_DECIMAL_PRECISION);

// ==================== Text Analysis Helpers ====================

/**
 * Normalizes text for comparison (lowercase, trimmed).
 *
 * @param text - Text to normalize
 * @returns Normalized text or empty string
 */
export const normalizeText = (text: string | undefined | null): string =>
  text?.toLowerCase().trim() ?? "";

/**
 * Checks if normalized text contains any keyword from a set.
 *
 * @param text - Text to search in
 * @param keywords - Set of keywords to find
 * @returns True if any keyword found
 */
export const containsKeyword = (text: string, keywords: ReadonlySet<string>): boolean => {
  const normalized = normalizeText(text);
  return Array.from(keywords).some((keyword) => normalized.includes(keyword));
};
