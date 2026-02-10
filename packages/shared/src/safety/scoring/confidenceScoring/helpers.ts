/**
 * Helper functions for confidence scoring.
 * Safety helpers, text processing, and utility functions.
 *
 * @module safety/scoring/confidenceScoring/helpers
 */

import type { LLMAnalysisResult, FactorValues } from "../../../core/types.js";
import type { RawFactors, BoundedFactors, WeightedFactors } from "../../types.js";
import { TEXT_LIMITS, LOG_VALUE_MAX_LENGTH } from "../../../constants/index.js";

// ==================== Log Sanitization ====================

/**
 * Pattern to match control characters and Unicode line separators.
 * Includes:
 * - ASCII control chars (\x00-\x1F): NUL, tabs, newlines, etc.
 * - DEL (\x7F)
 * - Unicode line separator (U+2028)
 * - Unicode paragraph separator (U+2029)
 * These can cause log injection or JSON formatting issues.
 */
// eslint-disable-next-line no-control-regex -- Intentionally matching control chars for sanitization
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F\u2028\u2029]/g;

/**
 * Sanitizes a value for safe logging.
 * - Coerces to string
 * - Removes control characters (newlines, tabs, etc.) to prevent log injection
 * - Caps length to prevent log bloat
 */
export const sanitizeForLog = (value: unknown): string => {
  if (value === undefined || value === null) {
    return String(value);
  }
  const str = typeof value === "string" ? value : String(value);
  return str.replace(CONTROL_CHAR_PATTERN, " ").slice(0, LOG_VALUE_MAX_LENGTH);
};

// ==================== Numeric Safety ====================

/**
 * Returns a safe number, converting NaN/Infinity to a fallback value.
 * Prevents factor functions from poisoning the entire score calculation.
 *
 * Design decision: fallback defaults to 0 (neutral) for all factors.
 * - Uncertainty: 0 = neutral (no penalty)
 * - Evidence alignment: 0 = neutral (could argue for min as more conservative)
 * - Completeness: 0 = neutral
 * - Knowledge base: 0 = neutral
 * - Consistency: 0 = neutral
 *
 * We use neutral fallback because NaN/Infinity indicates a bug in the factor
 * function itself, and we'd rather log it and continue with neutral impact
 * than crash or apply an arbitrary penalty. The bounding step ensures even
 * a 0 fallback is clamped to valid ranges.
 */
export const safeNumber = (value: number, fallback = 0): number =>
  Number.isFinite(value) ? value : fallback;

/**
 * Clamps a value to a specified range.
 * Handles NaN/Infinity by treating them as the fallback (0).
 */
export const clamp = (value: number, min: number, max: number): number => {
  const safe = safeNumber(value, 0);
  return Math.max(min, Math.min(max, safe));
};

// ==================== Text Processing ====================

/**
 * Checks if a string is blank (empty, null, undefined, or whitespace-only).
 */
export const isBlank = (str?: string): boolean => !str || str.trim().length === 0;

/**
 * Safely concatenates analysis text fields with trimming and length cap.
 * Prevents DoS from extremely large LLM outputs.
 */
export const buildAnalysisText = (analysis: LLMAnalysisResult): string =>
  [analysis.summary, analysis.reasoning, analysis.identifiedCause]
    .filter((field): field is string => typeof field === "string" && field.trim().length > 0)
    .join(" ")
    .slice(0, TEXT_LIMITS.MAX_ANALYSIS_TEXT_LENGTH);

// ==================== Empty Analysis Detection ====================

/**
 * Checks if analysis is effectively empty (not actionable).
 * Treats whitespace-only fields as empty.
 */
export const isEmptyAnalysis = (analysis: LLMAnalysisResult): boolean =>
  isBlank(analysis.summary) &&
  isBlank(analysis.identifiedCause) &&
  (!analysis.recommendedActions || analysis.recommendedActions.length === 0);

// ==================== Type Conversion ====================

/**
 * Converts factor values to the FactorValues interface.
 * Pure helper for building breakdown objects.
 */
export const toFactorValues = (
  factors: RawFactors | BoundedFactors | WeightedFactors
): FactorValues => ({
  uncertainty: factors.uncertainty,
  evidenceAlignment: factors.evidenceAlignment,
  completeness: factors.completeness,
  knowledgeBaseValidation: factors.knowledgeBaseValidation,
  consistency: factors.consistency,
});
