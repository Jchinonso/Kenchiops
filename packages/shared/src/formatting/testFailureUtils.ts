/**
 * Test Failure Utilities
 *
 * Functions for normalizing, collecting, and detecting test failures
 * across different test frameworks and languages.
 */

import {
  CI_FAILURE_DISPLAY,
  UI_EMOJI,
  GITHUB_ANNOTATION_LEVEL,
  TEST_FILE_PATTERNS,
} from "../constants/index.js";
import { truncateText } from "./uiHelpers.js";
import { normalizeEvidencePath, buildCanonicalPathMap, resolveCanonicalPath } from "./pathUtils.js";

// ==================== Types ====================

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
 * Options for error collection.
 */
export interface CollectErrorsOptions {
  readonly maxErrors?: number;
  readonly maxMessageLength?: number;
  readonly includeEmoji?: boolean;
}

// ==================== Test Failure Normalization ====================

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
    const normalizedFile = normalizeEvidencePath(testFailure.file);
    return normalizedFile === testFailure.file
      ? testFailure
      : { ...testFailure, file: normalizedFile };
  }

  const { testName } = testFailure;

  // Pattern 1: pytest-style with :: separator (tests/file.py::Class::method)
  const doubleColonMatch = testName.match(/^(.+?\.[a-zA-Z0-9]+)::(.+)$/);
  if (doubleColonMatch) {
    return {
      ...testFailure,
      file: normalizeEvidencePath(doubleColonMatch[1]),
      testName: doubleColonMatch[2],
    };
  }

  // Pattern 2: Jest-style with > separator (src/file.test.ts > describe > it)
  const jestMatch = testName.match(/^(.+?\.[a-zA-Z0-9]+)\s*>\s*(.+)$/);
  if (jestMatch) {
    return {
      ...testFailure,
      file: normalizeEvidencePath(jestMatch[1]),
      testName: jestMatch[2],
    };
  }

  // Pattern 3: File path with line number (src/file.ts:42)
  const lineMatch = testName.match(/^(.+?\.[a-zA-Z0-9]+):(\d+)(?:\s*[-:]?\s*(.+))?$/);
  if (lineMatch) {
    return {
      ...testFailure,
      file: normalizeEvidencePath(lineMatch[1]),
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
    return {
      ...testFailure,
      file: normalizeEvidencePath(firstPart),
      testName: parts.slice(1).join("::"),
    };
  }

  // Pattern 5: "test name in path/to/file.ext"
  const nameWithFileMatch = testName.match(
    /^(.+?)\s+in\s+([^\s:()]+[\\/][^\s:()]+\.[a-zA-Z0-9]+)$/
  );
  if (nameWithFileMatch) {
    return {
      ...testFailure,
      testName: nameWithFileMatch[1],
      file: normalizeEvidencePath(nameWithFileMatch[2]),
    };
  }

  // Pattern 6: Path-only test name (file path without separators)
  const pathOnlyMatch = testName.match(/^[^\s:()]+[\\/][^\s:()]+\.[a-zA-Z0-9]+$/);
  if (pathOnlyMatch) {
    return { ...testFailure, file: normalizeEvidencePath(testName) };
  }

  // No pattern matched, return unchanged
  return testFailure;
};

// ==================== Error Collection ====================

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
 * // ['`src/index.ts:42` - Type error...', 'should handle errors']
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
    .filter((annotation) => annotation.level === GITHUB_ANNOTATION_LEVEL.FAILURE)
    .slice(0, maxErrors)
    .map((annotation) => formatAnnotationError(annotation, maxMessageLength));

  // Calculate remaining slots for test failures
  const remainingSlots = Math.max(0, maxErrors - annotationErrors.length);

  // Collect test failures for remaining slots
  const testErrors = (testFailures ?? [])
    .slice(0, remainingSlots)
    .map((test) => formatTestFailure(test, includeEmoji));

  return [...annotationErrors, ...testErrors];
};

// ==================== Test File Detection (Language-Agnostic) ====================

/**
 * Checks if a file path appears to be a test file.
 * Language-agnostic detection supporting multiple test frameworks.
 *
 * @param filePath - The file path to check
 * @returns True if the file appears to be a test file
 */
export const isTestFile = (filePath: string): boolean =>
  TEST_FILE_PATTERNS.some((pattern) => pattern.test(filePath));

// ==================== Suite Counting ====================

/**
 * Counts unique test suites (files) from test failures.
 * A suite is defined as a unique file path.
 *
 * @param testFailures - Array of test failures with optional file property
 * @returns Number of unique test files/suites
 *
 * @example
 * countUniqueSuites([{ file: 'a.test.ts' }, { file: 'a.test.ts' }, { file: 'b.test.ts' }])
 * // Returns: 2
 */
export const countUniqueSuites = <T extends { file?: string }>(
  testFailures: readonly T[]
): number => {
  const rawPaths = testFailures
    .map((failure) => failure.file)
    .filter((file): file is string => Boolean(file));
  const pathMap = buildCanonicalPathMap(rawPaths);
  const uniqueFiles = new Set(rawPaths.map((path) => resolveCanonicalPath(path, pathMap)));
  return uniqueFiles.size;
};

/**
 * Counts unique file paths across test failures and annotations.
 *
 * @param testFailures - Array of test failures with optional file property
 * @param annotations - Array of annotations with optional path property
 * @returns Number of unique file paths
 */
export const countUniqueFiles = (
  testFailures: ReadonlyArray<{ readonly file?: string }>,
  annotations: ReadonlyArray<{ readonly path?: string }>
): number => {
  const rawPaths = [
    ...testFailures.map((failure) => failure.file).filter((file): file is string => Boolean(file)),
    ...annotations
      .map((annotation) => annotation.path)
      .filter((path): path is string => Boolean(path)),
  ];
  const pathMap = buildCanonicalPathMap(rawPaths);
  const uniqueFiles = new Set(rawPaths.map((path) => resolveCanonicalPath(path, pathMap)));
  return uniqueFiles.size;
};
