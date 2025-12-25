/**
 * CI Failure Formatting Utilities
 *
 * Shared formatting functions for CI failure analysis
 * used by both Slack and GitHub formatters.
 */

import { CI_FAILURE_DISPLAY } from "../constants/index.js";
import { truncateText } from "./uiHelpers.js";

/**
 * Annotation from CI check run.
 * Compatible with GitHub check run annotations.
 */
export interface CIAnnotation {
  readonly path: string;
  readonly startLine: number;
  readonly level: string; // "notice" | "warning" | "failure"
  readonly message: string;
}

/**
 * Test failure information.
 * Compatible with parsed test failures from CI logs.
 */
export interface CITestFailure {
  readonly testName: string;
  readonly file?: string;
  readonly error?: string; // Optional for compatibility
}

/**
 * Options for error collection.
 */
export interface CollectErrorsOptions {
  readonly maxErrors?: number;
  readonly maxMessageLength?: number;
  readonly includeEmoji?: boolean;
}

/**
 * Formats an annotation error into a display string.
 *
 * @param annotation - The annotation to format
 * @param maxMessageLength - Maximum message length
 * @returns Formatted error string
 */
const formatAnnotationError = (annotation: CIAnnotation, maxMessageLength: number): string => {
  const truncatedMessage = truncateText(annotation.message, maxMessageLength);
  return `\`${annotation.path}:${annotation.startLine}\` - ${truncatedMessage}`;
};

/**
 * Formats a test failure into a display string.
 *
 * @param test - The test failure to format
 * @param includeEmoji - Whether to include emoji prefix
 * @returns Formatted error string
 */
const formatTestFailure = (test: CITestFailure, includeEmoji: boolean): string => {
  const prefix = includeEmoji ? "\u274C " : ""; // ❌
  const location = test.file ? ` (\`${test.file}\`)` : "";
  return `${prefix}${test.testName}${location}`;
};

/**
 * Collects and formats errors from CI annotations and test failures.
 *
 * Used by both Slack and GitHub formatters to maintain consistent
 * error presentation across platforms.
 *
 * @param annotations - Array of CI annotations (optional)
 * @param testFailures - Array of test failures (optional)
 * @param options - Formatting options
 * @returns Array of formatted error strings
 *
 * @example
 * const errors = collectCIErrors(annotations, testFailures, { maxErrors: 3 });
 * // ['`src/index.ts:42` - Type error...', '❌ should handle errors']
 */
export const collectCIErrors = (
  annotations: readonly CIAnnotation[] | undefined,
  testFailures: readonly CITestFailure[] | undefined,
  options: CollectErrorsOptions = {}
): string[] => {
  const {
    maxErrors = CI_FAILURE_DISPLAY.MAX_ERRORS_DISPLAYED,
    maxMessageLength = CI_FAILURE_DISPLAY.MAX_ERROR_MESSAGE_LENGTH,
    includeEmoji = true,
  } = options;

  // Collect annotation errors (failures only), limited to maxErrors
  const annotationErrors = (annotations ?? [])
    .filter((ann) => ann.level === "failure")
    .slice(0, maxErrors)
    .map((ann) => formatAnnotationError(ann, maxMessageLength));

  // Calculate remaining slots for test failures
  const remainingSlots = Math.max(0, maxErrors - annotationErrors.length);

  // Collect test failures for remaining slots
  const testErrors = (testFailures ?? [])
    .slice(0, remainingSlots)
    .map((test) => formatTestFailure(test, includeEmoji));

  return [...annotationErrors, ...testErrors];
};

/**
 * Dependency change type.
 */
export type DependencyChangeType = "added" | "removed" | "updated";

/**
 * Dependency change information.
 */
export interface DependencyChange {
  readonly name: string;
  readonly type: DependencyChangeType;
  readonly oldVersion?: string;
  readonly newVersion?: string;
}

/**
 * Formatters for each dependency change type.
 */
const DEPENDENCY_FORMATTERS: Readonly<
  Record<DependencyChangeType, (dep: DependencyChange) => string>
> = {
  added: (dep) => `\u2795 Added: \`${dep.name}@${dep.newVersion}\``,
  removed: (dep) => `\u2796 Removed: \`${dep.name}@${dep.oldVersion}\``,
  updated: (dep) =>
    `\uD83D\uDD04 Updated: \`${dep.name}\` ${dep.oldVersion} \u2192 ${dep.newVersion}`,
};

/**
 * Formats a dependency change into a display string.
 *
 * @param dep - The dependency change to format
 * @returns Formatted dependency string with emoji
 *
 * @example
 * formatDependencyChange({ name: 'lodash', type: 'added', newVersion: '4.0.0' });
 * // '➕ Added: `lodash@4.0.0`'
 */
export const formatDependencyChange = (dep: DependencyChange): string => {
  const formatter = DEPENDENCY_FORMATTERS[dep.type];
  return formatter ? formatter(dep) : DEPENDENCY_FORMATTERS.updated(dep);
};

/**
 * Formats multiple dependency changes into a newline-separated string.
 *
 * @param deps - Array of dependency changes
 * @returns Formatted string with all changes
 */
export const formatDependencyChanges = (deps: readonly DependencyChange[]): string => {
  return deps.map(formatDependencyChange).join("\n");
};
