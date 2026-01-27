/**
 * Helper functions for consistency checking.
 * Single-token validation and keyword normalization.
 *
 * @module safety/scoring/consistency/helpers
 */

import { normalizeText } from "../../helpers.js";
import { invariant } from "../../../core/errors.js";

// ==================== Single Token Validation ====================

/**
 * Whitespace pattern for single-token validation.
 * Includes space, tab, newline, carriage return, etc.
 */
const WHITESPACE_PATTERN = /\s/;

/**
 * Validates that a string is a single token (no whitespace).
 * Self-contained: trims internally to avoid dependency on caller.
 * Multi-word phrases won't match with token-based matching.
 *
 * @param str - String to validate
 * @returns True if string is a single non-empty token
 */
export const isSingleToken = (str: string): boolean => {
  const trimmed = str.trim();
  return trimmed.length > 0 && !WHITESPACE_PATTERN.test(trimmed);
};

// ==================== Keyword Normalization ====================

/**
 * Normalizes a keyword and validates it's still a single token.
 * Catches cases where normalization might split a keyword (e.g., "out-of-memory" → "out of memory").
 *
 * @param keyword - Raw keyword from config
 * @param context - Description for error message (e.g., "RELEVANCE_RULES causeKeyword")
 * @returns Normalized keyword
 * @throws Invariant error if keyword becomes multi-token after normalization
 */
export const normalizeAndValidateKeyword = (keyword: string, context: string): string => {
  const normalized = normalizeText(keyword);
  invariant(
    isSingleToken(normalized),
    `${context} must be single token after normalization, got: "${keyword}" → "${normalized}"`
  );
  return normalized;
};
