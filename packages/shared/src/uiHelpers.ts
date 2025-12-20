/**
 * UI Helper Utilities
 *
 * Provides consistent formatting utilities for confidence scores,
 * colors, and text across all services.
 */

import { UI_CONFIDENCE_THRESHOLDS, SLACK_COLORS } from "./constants.js";

// ==================== Lookup Tables ====================

/**
 * Threshold-based lookup entry for confidence score mappings.
 * Sorted in descending order by threshold for efficient linear scan.
 */
interface ThresholdEntry<T> {
  readonly threshold: number;
  readonly value: T;
}

/**
 * Confidence label lookup table (descending order for first-match).
 */
const CONFIDENCE_LABELS: readonly ThresholdEntry<string>[] = [
  { threshold: UI_CONFIDENCE_THRESHOLDS.VERY_HIGH, value: "Very High" },
  { threshold: UI_CONFIDENCE_THRESHOLDS.HIGH, value: "High" },
  { threshold: UI_CONFIDENCE_THRESHOLDS.MEDIUM, value: "Medium" },
  { threshold: UI_CONFIDENCE_THRESHOLDS.LOW, value: "Low" },
] as const;

/**
 * Confidence color lookup table.
 * Uses UI_CONFIDENCE_THRESHOLDS for consistency.
 */
const CONFIDENCE_COLORS: readonly ThresholdEntry<string>[] = [
  { threshold: UI_CONFIDENCE_THRESHOLDS.HIGH, value: SLACK_COLORS.SUCCESS },
  { threshold: UI_CONFIDENCE_THRESHOLDS.MEDIUM, value: SLACK_COLORS.WARNING },
] as const;

/**
 * Confidence emoji lookup table.
 */
const CONFIDENCE_EMOJIS: readonly ThresholdEntry<string>[] = [
  { threshold: UI_CONFIDENCE_THRESHOLDS.VERY_HIGH, value: ":large_green_circle:" },
  { threshold: UI_CONFIDENCE_THRESHOLDS.HIGH, value: ":large_blue_circle:" },
  { threshold: UI_CONFIDENCE_THRESHOLDS.MEDIUM, value: ":large_yellow_circle:" },
  { threshold: UI_CONFIDENCE_THRESHOLDS.LOW, value: ":large_orange_circle:" },
] as const;

/**
 * Generic threshold lookup - finds first matching threshold (descending order).
 */
const findByThreshold = <T>(score: number, table: readonly ThresholdEntry<T>[], fallback: T): T => {
  const entry = table.find(({ threshold }) => score >= threshold);
  return entry?.value ?? fallback;
};

// ==================== Public API ====================

/**
 * Gets a human-readable label for a confidence score.
 *
 * @param score - Confidence score between 0 and 1
 * @returns Label like "Very High", "High", "Medium", "Low", or "Very Low"
 */
export const getConfidenceLabel = (score: number): string =>
  findByThreshold(score, CONFIDENCE_LABELS, "Very Low");

/**
 * Gets a human-readable label for a confidence score with parentheses.
 * Used when appending to percentage display.
 *
 * @param score - Confidence score between 0 and 1
 * @returns Label like "(Very High)", "(High)", etc.
 */
export const getConfidenceLabelParenthesized = (score: number): string =>
  `(${getConfidenceLabel(score)})`;

/**
 * Gets the appropriate Slack color hex code based on confidence score.
 *
 * @param score - Confidence score between 0 and 1
 * @returns Hex color code (green for high, yellow for medium, red for low)
 */
export const getConfidenceColor = (score: number): string =>
  findByThreshold(score, CONFIDENCE_COLORS, SLACK_COLORS.DANGER);

/**
 * Gets the appropriate emoji for a confidence score.
 *
 * @param score - Confidence score between 0 and 1
 * @returns Slack emoji string
 */
export const getConfidenceEmoji = (score: number): string =>
  findByThreshold(score, CONFIDENCE_EMOJIS, ":red_circle:");

/**
 * Truncates text to a maximum length with ellipsis.
 *
 * @param text - The text to truncate
 * @param maxLength - Maximum allowed length
 * @returns Truncated text with "..." if it exceeds maxLength
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
};
