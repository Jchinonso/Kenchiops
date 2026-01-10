/**
 * Evidence ID Utilities
 *
 * Functions for generating and formatting evidence IDs
 * used to trace root causes back to specific test failures,
 * annotations, logs, and diffs.
 */

// ==================== Evidence ID Generators ====================

/**
 * Generates a test evidence ID for display.
 *
 * @param index - Zero-based index of the test failure
 * @returns Evidence ID string like "test#1"
 */
export const generateTestEvidenceId = (index: number): string => `test#${index + 1}`;

/**
 * Generates an annotation evidence ID for display.
 *
 * @param index - Zero-based index of the annotation
 * @returns Evidence ID string like "anno#1"
 */
export const generateAnnoEvidenceId = (index: number): string => `anno#${index + 1}`;

/**
 * Generates a check evidence ID for display.
 *
 * @param index - Zero-based index of the check
 * @returns Evidence ID string like "check#1"
 */
export const generateCheckEvidenceId = (index: number): string => `check#${index + 1}`;

/**
 * Generates a log evidence ID for display.
 * Used to reference specific log excerpts in root cause analysis.
 *
 * @param index - Zero-based index of the log excerpt
 * @returns Evidence ID string like "log#1"
 */
export const generateLogEvidenceId = (index: number): string => `log#${index + 1}`;

/**
 * Generates a diff evidence ID for display.
 * Used to reference specific diff/code changes in root cause analysis.
 *
 * @param index - Zero-based index of the diff chunk
 * @returns Evidence ID string like "diff#1"
 */
export const generateDiffEvidenceId = (index: number): string => `diff#${index + 1}`;

// ==================== Evidence ID Formatting ====================

/**
 * Appends an evidence ID to text for traceability.
 *
 * @param text - The text to append to
 * @param evidenceId - The evidence ID to append (e.g., "test#1")
 * @returns Text with evidence ID appended: "message [test#1]"
 *
 * @example
 * formatWithEvidenceId('Expected value to be true', 'test#1')
 * // Returns: 'Expected value to be true [test#1]'
 */
export const formatWithEvidenceId = (text: string, evidenceId?: string): string =>
  evidenceId ? `${text} [${evidenceId}]` : text;

/**
 * Formats a file location with an optional line number.
 *
 * @param file - File path
 * @param line - Line number (1-based)
 * @returns Location string like "path/to/file.ts:42" or null if file missing
 */
export const formatEvidenceLocation = (file?: string, line?: number): string | null => {
  if (!file) {
    return null;
  }
  if (typeof line === "number" && line > 0) {
    return `${file}:${line}`;
  }
  return file;
};
