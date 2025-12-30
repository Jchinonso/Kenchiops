/**
 * UI Helper Utilities
 *
 * Provides consistent formatting utilities for confidence scores,
 * colors, text, and list formatting across all services.
 */

import {
  UI_CONFIDENCE_THRESHOLDS,
  SLACK_COLORS,
  TIME_CONSTANTS,
  GITHUB_COMMENT_DISPLAY,
} from "../constants/index.js";

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
const CONFIDENCE_LABELS: ReadonlyArray<ThresholdEntry<string>> = [
  { threshold: UI_CONFIDENCE_THRESHOLDS.VERY_HIGH, value: "Very High" },
  { threshold: UI_CONFIDENCE_THRESHOLDS.HIGH, value: "High" },
  { threshold: UI_CONFIDENCE_THRESHOLDS.MEDIUM, value: "Medium" },
  { threshold: UI_CONFIDENCE_THRESHOLDS.LOW, value: "Low" },
] as const;

/**
 * Confidence color lookup table.
 * Uses UI_CONFIDENCE_THRESHOLDS for consistency.
 */
const CONFIDENCE_COLORS: ReadonlyArray<ThresholdEntry<string>> = [
  { threshold: UI_CONFIDENCE_THRESHOLDS.HIGH, value: SLACK_COLORS.SUCCESS },
  { threshold: UI_CONFIDENCE_THRESHOLDS.MEDIUM, value: SLACK_COLORS.WARNING },
] as const;

/**
 * Confidence emoji lookup table.
 */
const CONFIDENCE_EMOJIS: ReadonlyArray<ThresholdEntry<string>> = [
  { threshold: UI_CONFIDENCE_THRESHOLDS.VERY_HIGH, value: ":large_green_circle:" },
  { threshold: UI_CONFIDENCE_THRESHOLDS.HIGH, value: ":large_blue_circle:" },
  { threshold: UI_CONFIDENCE_THRESHOLDS.MEDIUM, value: ":large_yellow_circle:" },
  { threshold: UI_CONFIDENCE_THRESHOLDS.LOW, value: ":large_orange_circle:" },
] as const;

/**
 * Generic threshold lookup - finds first matching threshold (descending order).
 */
const findByThreshold = <T>(
  score: number,
  table: ReadonlyArray<ThresholdEntry<T>>,
  fallback: T
): T => {
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
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 3)}...`;
};

// ==================== Relative Time Formatting ====================

/**
 * Time unit configuration for relative time formatting.
 */
interface TimeUnit {
  readonly threshold: number;
  readonly divisor: number;
  readonly singular: string;
  readonly plural: string;
}

/**
 * Time units in descending order of magnitude.
 * Each entry defines how to format times within that range.
 */
const TIME_UNITS: readonly TimeUnit[] = [
  {
    threshold:
      TIME_CONSTANTS.DAYS_PER_WEEK * TIME_CONSTANTS.HOURS_PER_DAY * TIME_CONSTANTS.MINUTES_PER_HOUR,
    divisor: TIME_CONSTANTS.HOURS_PER_DAY * TIME_CONSTANTS.MINUTES_PER_HOUR,
    singular: "day",
    plural: "days",
  },
  {
    threshold: TIME_CONSTANTS.HOURS_PER_DAY * TIME_CONSTANTS.MINUTES_PER_HOUR,
    divisor: TIME_CONSTANTS.MINUTES_PER_HOUR,
    singular: "hour",
    plural: "hours",
  },
  {
    threshold: TIME_CONSTANTS.MINUTES_PER_HOUR,
    divisor: 1,
    singular: "minute",
    plural: "minutes",
  },
] as const;

/**
 * Formats a value with proper singular/plural suffix.
 */
const formatWithUnit = (value: number, singular: string, plural: string): string =>
  `${value} ${value === 1 ? singular : plural} ago`;

/**
 * Formats a date as a human-readable relative time string.
 *
 * @param date - The date to format
 * @returns Relative time string (e.g., "5 minutes ago", "2 hours ago")
 */
export const formatRelativeTime = (date: Date): string => {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / TIME_CONSTANTS.MILLISECONDS_PER_MINUTE);

  // Less than 1 minute
  if (diffMins < 1) {
    return "just now";
  }

  // Find matching time unit
  const matchedUnit = TIME_UNITS.find(({ threshold }) => diffMins >= threshold);

  if (matchedUnit) {
    const value = Math.floor(diffMins / matchedUnit.divisor);
    return formatWithUnit(value, matchedUnit.singular, matchedUnit.plural);
  }

  // Default: minutes (diffMins >= 1 but < 60)
  return formatWithUnit(diffMins, "minute", "minutes");
};

// ==================== Text Formatting Helpers ====================

/**
 * Pluralizes a word based on count.
 *
 * @param count - The count to check
 * @param singular - Singular form of the word
 * @param plural - Optional plural form (defaults to singular + "s")
 * @returns Properly pluralized word
 *
 * @example
 * pluralize(1, "test") // "test"
 * pluralize(5, "test") // "tests"
 * pluralize(2, "entry", "entries") // "entries"
 */
export const pluralize = (count: number, singular: string, plural?: string): string =>
  count === 1 ? singular : (plural ?? `${singular}s`);

/**
 * Extracts repository name from a full repository path.
 *
 * @param repository - Full repository path (e.g., "owner/repo")
 * @returns Repository name only (e.g., "repo")
 *
 * @example
 * getRepoName("kenchiops/my-app") // "my-app"
 * getRepoName("single") // "single"
 */
export const getRepoName = (repository: string): string =>
  repository.split("/").pop() ?? repository;

/**
 * Extracts the first sentence from text.
 *
 * @param text - The text to extract from
 * @returns First sentence (up to first period, exclamation, or question mark)
 *
 * @example
 * getFirstSentence("Build failed. See logs.") // "Build failed"
 * getFirstSentence("No errors found!") // "No errors found"
 */
export const getFirstSentence = (text: string): string => text.split(/[.!?]/)[0]?.trim() ?? "";

/**
 * Builds a truncated list with overflow message.
 * Useful for displaying limited items with a "...and X more" indicator.
 *
 * @param items - Array of items to process
 * @param formatItem - Function to format each item
 * @param maxItems - Maximum items to display (defaults to GITHUB_COMMENT_DISPLAY.MAX_LIST_ITEMS)
 * @param overflowLabel - Label for overflow message (e.g., "failures", "errors")
 * @returns Array of formatted strings including overflow message if needed
 *
 * @example
 * buildTruncatedList(
 *   ["a", "b", "c", "d"],
 *   (item) => `- ${item}`,
 *   3,
 *   "items"
 * )
 * // Returns: ["- a", "- b", "- c", "- _...and 1 more items_"]
 */
export const buildTruncatedList = <T>(
  items: readonly T[],
  formatItem: (item: T, index: number) => string,
  maxItems: number = GITHUB_COMMENT_DISPLAY.MAX_LIST_ITEMS,
  overflowLabel: string
): string[] => {
  const displayed = items.slice(0, maxItems).map(formatItem);
  const overflow =
    items.length > maxItems ? [`- _...and ${items.length - maxItems} more ${overflowLabel}_`] : [];
  return [...displayed, ...overflow];
};
