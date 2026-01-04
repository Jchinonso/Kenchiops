/**
 * CI Failure Formatting Utilities
 *
 * Shared formatting functions for CI failure analysis
 * used by both Slack and GitHub formatters.
 */

import {
  CI_FAILURE_DISPLAY,
  UI_EMOJI,
  DEPENDENCY_EMOJI_MAP,
  GITHUB_ANNOTATION_LEVEL,
} from "../constants/index.js";
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
  readonly line?: number;
  readonly error?: string; // Optional for compatibility
}

/**
 * Normalizes a test failure by extracting file path from test identifier.
 * Handles multiple test framework formats:
 * - Python pytest: tests/test_calc.py::TestClass::test_method
 * - JavaScript/Jest: src/utils.test.ts > describe > test name
 * - Go: TestPackage/TestName
 * - Rust: module::submodule::test_name
 * - Generic: path/to/file.ext::test_name or path/to/file.ext:line
 *
 * @param testFailure - The test failure to normalize
 * @returns Normalized test failure with separated file and testName
 */
export const normalizeTestFailure = <T extends { testName: string; file?: string; line?: number }>(
  testFailure: T
): T => {
  // Already has a file, no normalization needed
  if (testFailure.file) {
    return testFailure;
  }

  const { testName } = testFailure;

  // Pattern 1: pytest-style with :: separator (tests/file.py::Class::method)
  const doubleColonMatch = testName.match(/^(.+?\.[a-zA-Z0-9]+)::(.+)$/);
  if (doubleColonMatch) {
    return { ...testFailure, file: doubleColonMatch[1], testName: doubleColonMatch[2] };
  }

  // Pattern 2: Jest-style with > separator (src/file.test.ts > describe > it)
  const jestMatch = testName.match(/^(.+?\.[a-zA-Z0-9]+)\s*>\s*(.+)$/);
  if (jestMatch) {
    return { ...testFailure, file: jestMatch[1], testName: jestMatch[2] };
  }

  // Pattern 3: File path with line number (src/file.ts:42)
  const lineMatch = testName.match(/^(.+?\.[a-zA-Z0-9]+):(\d+)(?:\s*[-:]?\s*(.+))?$/);
  if (lineMatch) {
    return {
      ...testFailure,
      file: lineMatch[1],
      line: parseInt(lineMatch[2], 10),
      testName: lineMatch[3] ?? testFailure.testName,
    };
  }

  // Pattern 4: Path-like first segment (tests/something or src/something)
  const parts = testName.split(/::/);
  const firstPart = parts[0] ?? "";
  const looksLikePath =
    (firstPart.includes("/") || firstPart.includes("\\")) && /\.[a-zA-Z0-9]+$/.test(firstPart);

  if (looksLikePath && parts.length > 1) {
    return { ...testFailure, file: firstPart, testName: parts.slice(1).join("::") };
  }

  // Pattern 5: "test name in path/to/file.ext"
  const nameWithFileMatch = testName.match(
    /^(.+?)\s+in\s+([^\s:()]+[\\/][^\s:()]+\.[a-zA-Z0-9]+)$/
  );
  if (nameWithFileMatch) {
    return {
      ...testFailure,
      testName: nameWithFileMatch[1],
      file: nameWithFileMatch[2],
    };
  }

  // Pattern 6: Path-only test name (file path without separators)
  const pathOnlyMatch = testName.match(/^[^\s:()]+[\\/][^\s:()]+\.[a-zA-Z0-9]+$/);
  if (pathOnlyMatch) {
    return { ...testFailure, file: testName };
  }

  // No pattern matched, return unchanged
  return testFailure;
};

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
  const hasPath = annotation.path !== "unknown" && annotation.path.length > 0;
  const hasLine = annotation.startLine > 0;
  const location = hasPath
    ? hasLine
      ? `\`${annotation.path}:${annotation.startLine}\``
      : `\`${annotation.path}\``
    : "";
  return location ? `${location} - ${truncatedMessage}` : truncatedMessage;
};

/**
 * Formats a test failure into a display string.
 *
 * @param test - The test failure to format
 * @param includeEmoji - Whether to include emoji prefix
 * @returns Formatted error string
 */
const formatTestFailure = (test: CITestFailure, includeEmoji: boolean): string => {
  const prefix = includeEmoji ? `${UI_EMOJI.failure} ` : "";
  const showLocation = test.file && test.file !== test.testName;
  const location = showLocation ? ` (\`${test.file}\`)` : "";
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
    .filter((ann) => ann.level === GITHUB_ANNOTATION_LEVEL.FAILURE)
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
  added: (dep) => `${DEPENDENCY_EMOJI_MAP.added} Added: \`${dep.name}@${dep.newVersion}\``,
  removed: (dep) => `${DEPENDENCY_EMOJI_MAP.removed} Removed: \`${dep.name}@${dep.oldVersion}\``,
  updated: (dep) =>
    `${DEPENDENCY_EMOJI_MAP.updated} Updated: \`${dep.name}\` ${dep.oldVersion} → ${dep.newVersion}`,
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
export const formatDependencyChanges = (deps: readonly DependencyChange[]): string =>
  deps.map(formatDependencyChange).join("\n");
