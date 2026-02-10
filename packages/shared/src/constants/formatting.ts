/**
 * Formatting and text processing constants.
 *
 * Constants for prompt formatting, text truncation, and display.
 *
 * @module constants/formatting
 */

// ==================== Prompt Text Limits ====================

/** Maximum characters for error message in prompt (single line) */
export const MAX_MESSAGE_LENGTH = 500;

/** Maximum characters for snippet in prompt */
export const MAX_SNIPPET_LENGTH = 2000;

/** Maximum characters for degraded mode raw log preview */
export const MAX_RAW_LOG_PREVIEW_LENGTH = 3000;

/** Maximum snippet length when truncating evidence */
export const MAX_SNIPPET_LENGTH_TRUNCATED = 500;

// ==================== Truncation Config ====================

/** Ratio of head to tail in middle truncation (60% head, 40% tail) */
export const TRUNCATE_HEAD_RATIO = 0.6;

/** Minimum length for middle truncation to be meaningful */
export const MIN_MIDDLE_TRUNCATE_LENGTH = 50;

/** Truncation marker for middle truncation */
export const TRUNCATE_MARKER = "\n...[TRUNCATED]...\n";

// ==================== Token Estimation ====================

/** Approximate characters per token for GPT models */
export const CHARS_PER_TOKEN = 4;

// ==================== Display ====================

/** Percentage multiplier for similarity/score display */
export const PERCENTAGE_MULTIPLIER = 100;
