/**
 * Formatter Utilities
 *
 * Shared utility functions and constants for formatting
 * consolidated CI failure messages.
 */

import type { AnalyzedFailure, RecommendedAction } from "../services/aggregation/types.js";

// ==================== Constants ====================

/**
 * Priority emoji lookup
 */
export const PRIORITY_EMOJI: Readonly<Record<string, string>> = {
  immediate: "🔴",
  high: "🔴",
  medium: "🟡",
  low: "🟢",
} as const;

/**
 * Priority order lookup for sorting actions
 */
export const PRIORITY_ORDER: Readonly<Record<string, number>> = {
  immediate: 0,
  high: 1,
  medium: 2,
  low: 3,
} as const;

/**
 * Maximum items to display per section
 */
export const DISPLAY_LIMITS = {
  annotationsPerCheck: 10,
  totalAnnotations: 30,
  recommendedActions: 8,
  checksToShow: 10,
  slackAnnotationsPerCheck: 5,
  slackMaxChecks: 5,
} as const;

// ==================== Utility Functions ====================

/**
 * Get priority emoji from priority value
 */
export const getPriorityEmoji = (priority: string | number): string => {
  if (typeof priority === "number") {
    return priority <= 1 ? "🔴" : priority <= 2 ? "🟡" : "🟢";
  }
  return PRIORITY_EMOJI[priority.toLowerCase()] ?? "⚪";
};

/**
 * Get numeric priority for sorting
 */
export const getNumericPriority = (priority: string | number): number =>
  typeof priority === "string" ? (PRIORITY_ORDER[priority.toLowerCase()] ?? 4) : priority;

/**
 * Calculate average confidence from failures
 */
export const calculateAverageConfidence = (failures: readonly AnalyzedFailure[]): number => {
  if (failures.length === 0) return 0;
  const sum = failures.reduce((acc, f) => acc + f.confidence, 0);
  return sum / failures.length;
};

/**
 * Get confidence emoji based on percentage
 */
export const getConfidenceEmoji = (percent: number): string =>
  percent >= 70 ? "🟢" : percent >= 40 ? "🟡" : "🔴";

/**
 * Deduplicate and merge recommended actions from all failures.
 */
export const mergeRecommendedActions = (failures: readonly AnalyzedFailure[]): RecommendedAction[] => {
  const actionMap = failures
    .flatMap((f) => f.recommendedActions)
    .reduce((map, action) => {
      const key = action.description.toLowerCase().trim();
      return map.has(key) ? map : map.set(key, action);
    }, new Map<string, RecommendedAction>());

  return Array.from(actionMap.values())
    .sort((a, b) => getNumericPriority(a.priority) - getNumericPriority(b.priority))
    .slice(0, DISPLAY_LIMITS.recommendedActions);
};
