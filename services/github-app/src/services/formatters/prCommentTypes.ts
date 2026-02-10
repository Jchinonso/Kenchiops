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
  readonly module_not_found: number;
  readonly runtime: number;
  readonly other: number;
  readonly total: number;
}

/**
 * Lint error structure for building sections.
 */
export interface LintErrorForDisplay {
  readonly code: string;
  readonly message: string;
  readonly line: number;
  readonly column?: number;
  readonly symbol?: string;
  readonly suggestion?: string;
}

/**
 * Lint error with file for section building.
 */
export interface LintErrorWithFile extends LintErrorForDisplay {
  readonly file: string;
}

/** Recommended action with description and priority. */
export interface RecommendedActionInput {
  readonly description: string;
  readonly priority: string | number;
}

/**
 * Characters for building visual progress bars.
 */
export const PROGRESS_BAR = {
  FILLED: "\u2588", // █
  EMPTY: "\u2591", // ░
  WIDTH: 10,
} as const;
