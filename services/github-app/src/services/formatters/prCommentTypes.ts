/**
 * Types for PR Comment Formatting
 *
 * Defines interfaces used by PR comment formatters.
 */

/**
 * Feedback links for PR comment footer.
 */
export interface FeedbackLinks {
  readonly correctUrl: string;
  readonly incorrectUrl: string;
}

/**
 * Error category breakdown for test failure visualization.
 */
export interface ErrorCategoryBreakdown {
  readonly assertion: number;
  readonly timeout: number;
  readonly runtime: number;
  readonly other: number;
  readonly total: number;
}

/**
 * Characters for building visual progress bars.
 */
export const PROGRESS_BAR = {
  FILLED: "\u2588", // █
  EMPTY: "\u2591", // ░
  WIDTH: 10,
} as const;
