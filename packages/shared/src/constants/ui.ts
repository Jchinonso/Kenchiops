/**
 * UI, display, and formatting constants for Slack and GitHub.
 *
 * Design Principles:
 * - Visual hierarchy through consistent spacing and typography
 * - Clear status indication with semantic colors and icons
 * - Scannable content with progressive disclosure
 * - Cross-platform consistency (Slack Block Kit + GitHub Markdown)
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
  /** Number of segments in visual progress/confidence bars */
  PROGRESS_BAR_SEGMENTS: 5,
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
  /** Voice Guide: Use "!!" for infrastructure issues */
  infraWarning: "!!",
  /** Voice Guide: Use "x" for failed file entries */
  failedFile: "x",

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
  info: "ℹ️",
  test: "🧪",
  alert: "🚨",
  target: "🎯",
  link: "🔗",
  branch: "🔀",
  user: "👤",

  // Knowledge/documentation icons
  book: "📚",
  history: "📜",
  runbook: "📘",
  postmortem: "📋",
  troubleshooting: "🔧",
  sop: "📝",
  external: "🌐",
  lesson: "🎓",
  chat: "💬",
  document: "📄",
  mag: "🔎",
  hourglass: "⏳",

  // Number indicators for lists
  num1: "1️⃣",
  num2: "2️⃣",
  num3: "3️⃣",
  num4: "4️⃣",
  num5: "5️⃣",

  // Feedback icons
  thumbsUp: "👍",
  thumbsDown: "👎",
} as const;

/**
 * Priority emoji lookup table using centralized UI_EMOJI.
 */
export const PRIORITY_EMOJI_MAP: Readonly<Record<string, string>> = {
  immediate: UI_EMOJI.priorityCritical,
  critical: UI_EMOJI.priorityCritical,
  high: UI_EMOJI.priorityHigh,
  medium: UI_EMOJI.priorityMedium,
  low: UI_EMOJI.priorityLow,
} as const;

/**
 * Document type emoji lookup table for Q&A results.
 */
export const DOC_TYPE_EMOJI_MAP: Readonly<Record<string, string>> = {
  runbook: UI_EMOJI.runbook,
  postmortem: UI_EMOJI.postmortem,
  troubleshooting: UI_EMOJI.troubleshooting,
  sop: UI_EMOJI.sop,
  pr_fix: UI_EMOJI.branch,
  slack_resolution: UI_EMOJI.chat,
  analysis_lesson: UI_EMOJI.lesson,
  pr_diff: UI_EMOJI.document,
  external: UI_EMOJI.external,
} as const;

/**
 * Number emoji lookup for result lists.
 */
export const NUMBER_EMOJI_LIST: readonly string[] = [
  UI_EMOJI.num1,
  UI_EMOJI.num2,
  UI_EMOJI.num3,
  UI_EMOJI.num4,
  UI_EMOJI.num5,
] as const;

/**
 * Priority order lookup for sorting actions (lower = higher priority).
 */
export const PRIORITY_ORDER: Readonly<Record<string, number>> = {
  immediate: 0,
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
} as const;

/**
 * Default priority order for unknown priorities.
 */
export const PRIORITY_ORDER_DEFAULT = 4;

/**
 * Annotation level emoji lookup table using centralized UI_EMOJI.
 */
export const ANNOTATION_LEVEL_EMOJI_MAP: Readonly<Record<string, string>> = {
  failure: UI_EMOJI.failure,
  warning: UI_EMOJI.warning,
  notice: UI_EMOJI.info,
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

// Note: SHA display length is in DISPLAY_DEFAULTS (redis.ts) to avoid duplication
