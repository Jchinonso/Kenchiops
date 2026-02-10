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
 * Pattern for splitting text into tokens.
 * Splits on whitespace, punctuation, underscores, and hyphens.
 * This ensures compound terms like "auth_secret" become ["auth", "secret"].
 */
const TOKEN_SPLIT_PATTERN = /[\s,.;:!?()[\]{}'"<>_-]+/;

/**
 * Pattern for collapsing multiple whitespace characters.
 */
const WHITESPACE_COLLAPSE_PATTERN = /\s+/g;

/**
 * Normalizes text for comparison.
 * - Trims leading/trailing whitespace
 * - Lowercases
 * - Collapses multiple whitespace to single space
 *
 * @param text - Text to normalize
 * @returns Normalized text or empty string
 */
export const normalizeText = (text: string | undefined | null): string => {
  if (text === undefined || text === null) {
    return "";
  }
  return text.toLowerCase().trim().replace(WHITESPACE_COLLAPSE_PATTERN, " ");
};

/**
 * Tokenizes text into words for word-boundary-safe matching.
 * Splits on whitespace and punctuation, filters empty tokens.
 *
 * @param text - Text to tokenize (should already be normalized)
 * @returns Array of lowercase tokens
 */
export const tokenize = (text: string): readonly string[] =>
  text.split(TOKEN_SPLIT_PATTERN).filter((token) => token.length > 0);

/**
 * Checks if any token in the text matches any keyword (word-boundary-safe).
 * Avoids false positives like "ram" matching "program".
 *
 * @param tokens - Tokenized text (from tokenize())
 * @param keywords - Keywords to match against
 * @returns True if any token matches any keyword
 */
export const tokensContainAny = (
  tokens: readonly string[],
  keywords: readonly string[]
): boolean => {
  const keywordSet = new Set(keywords);
  return tokens.some((token) => keywordSet.has(token));
};

/**
 * Checks if normalized text contains any keyword from a set.
 * Uses substring matching (may have false positives).
 *
 * @param text - Text to search in
 * @param keywords - Set of keywords to find
 * @returns True if any keyword found
 * @deprecated Use tokensContainAny() for word-boundary-safe matching
 */
export const containsKeyword = (text: string, keywords: ReadonlySet<string>): boolean => {
  const normalized = normalizeText(text);
  // for...of allowed for early-exit per CLAUDE.md
  for (const keyword of keywords) {
    if (normalized.includes(keyword)) {
      return true;
    }
  }
  return false;
};
