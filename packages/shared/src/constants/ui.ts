/**
 * UI, display, and formatting constants for Slack and GitHub.
 */

/**
 * UI/Display thresholds for confidence score visualization.
 * Used in Slack formatters and other UI components.
 */
export const UI_CONFIDENCE_THRESHOLDS = {
  VERY_HIGH: 0.85,
  HIGH: 0.7,
  MEDIUM: 0.5,
  LOW: 0.3,
} as const;

/**
 * UI/Display constants.
 */
export const UI_CONSTANTS = {
  PERCENTAGE_MULTIPLIER: 100,
  MAX_ACTIONS_TO_DISPLAY: 3,
  ACTION_TIMEOUT_MS: 2000,
} as const;

/**
 * Centralized emoji constants for all UI components (Slack, GitHub, etc.).
 * Single source of truth to prevent duplication across formatters.
 */
export const UI_EMOJI = {
  // Status indicators
  failure: "❌",
  success: "✅",
  warning: "⚠️",

  // Confidence levels (ordered high to low)
  confidenceHigh: "🟢",
  confidenceMedium: "🟡",
  confidenceLow: "🟠",
  confidenceVeryLow: "🔴",

  // Priority levels
  priorityCritical: "🔴",
  priorityHigh: "🟠",
  priorityMedium: "🟡",
  priorityLow: "🟢",
  priorityDefault: "⚪",

  // Dependency change types
  depAdded: "➕",
  depRemoved: "➖",
  depUpdated: "🔄",

  // Section/content icons
  package: "📦",
  search: "🔍",
  impact: "💥",
  tools: "🛠️",
  list: "📋",
  details: "📊",
  location: "📍",
  workflow: "🔧",
  commit: "📝",
  timer: "⏱️",
  robot: "🤖",
} as const;

/**
 * Priority emoji lookup table using centralized UI_EMOJI.
 */
export const PRIORITY_EMOJI_MAP: Readonly<Record<string, string>> = {
  critical: UI_EMOJI.priorityCritical,
  high: UI_EMOJI.priorityHigh,
  medium: UI_EMOJI.priorityMedium,
  low: UI_EMOJI.priorityLow,
} as const;

/**
 * Dependency change emoji lookup table using centralized UI_EMOJI.
 */
export const DEPENDENCY_EMOJI_MAP: Readonly<Record<string, string>> = {
  added: UI_EMOJI.depAdded,
  removed: UI_EMOJI.depRemoved,
  updated: UI_EMOJI.depUpdated,
} as const;

/**
 * Confidence badge thresholds with corresponding emojis.
 */
export const CONFIDENCE_BADGE_THRESHOLDS: ReadonlyArray<{ min: number; emoji: string }> = [
  { min: UI_CONFIDENCE_THRESHOLDS.VERY_HIGH, emoji: UI_EMOJI.confidenceHigh },
  { min: UI_CONFIDENCE_THRESHOLDS.HIGH, emoji: UI_EMOJI.confidenceMedium },
  { min: UI_CONFIDENCE_THRESHOLDS.MEDIUM, emoji: UI_EMOJI.confidenceLow },
] as const;

/**
 * Color codes for Slack attachments based on severity/confidence.
 */
export const SLACK_COLORS = {
  DANGER: "#E01E5A", // Red - critical/low confidence
  WARNING: "#ECB22E", // Yellow - medium confidence
  SUCCESS: "#2EB67D", // Green - high confidence
  INFO: "#36C5F0", // Blue - informational
  PURPLE: "#4A154B", // Purple - Slack brand color
} as const;

/**
 * Status emoji for Slack progress updates (Slack-specific format).
 */
export const SLACK_STATUS_EMOJI = {
  pending: ":hourglass_flowing_sand:",
  in_progress: ":gear:",
  completed: ":white_check_mark:",
  failed: ":x:",
} as const;

/**
 * Priority emoji for Slack messages (Slack-specific format).
 */
export const PRIORITY_EMOJI = {
  critical: ":red_circle:",
  high: ":red_circle:",
  medium: ":large_orange_circle:",
  low: ":white_circle:",
} as const;

/**
 * Valid safety levels for runtime validation.
 */
export const VALID_SAFETY_LEVELS: Readonly<Set<string>> = new Set([
  "safe",
  "low_risk",
  "medium_risk",
  "high_risk",
  "dangerous",
]);

/**
 * Git-related display constants.
 */
export const GIT_DISPLAY = {
  /** Standard length for displaying truncated commit SHA */
  SHA_DISPLAY_LENGTH: 7,
} as const;
