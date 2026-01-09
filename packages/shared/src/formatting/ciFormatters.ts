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
  FORMATTER_DISPLAY_LIMITS,
  FILE_PATH_VALIDATION,
  TEXT_SANITIZATION_PATTERNS,
} from "../constants/index.js";
import { truncateText } from "./uiHelpers.js";
import {
  INFRA_PATTERNS,
  extractAssertionSnippet,
  isGenericErrorLine,
} from "../openaiClient/evidencePatterns.js";

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

// ==================== Path Normalization ====================

/**
 * Normalizes a test file path for consistent display.
 * Converts backslashes to forward slashes and normalizes __tests__ to tests.
 *
 * @param path - The file path to normalize
 * @returns Normalized file path
 *
 * @example
 * normalizeTestFilePath('src\\__tests__\\index.test.ts')
 * // Returns: 'src/tests/index.test.ts'
 */
export const normalizeTestFilePath = (path: string): string =>
  path.replace(/\\/g, "/").replace(/__tests__/g, "tests");

/**
 * Normalizes file paths for comparison and deduplication.
 * - Normalizes slashes
 * - Collapses __tests__ to tests
 * - Strips leading "./"
 */
const normalizeEvidencePath = (path: string): string => {
  const normalized = normalizeTestFilePath(path.trim());
  return normalized.startsWith("./") ? normalized.slice(2) : normalized;
};

// ==================== Service Path Grouping ====================

/**
 * Common directory prefixes that should be skipped when extracting module name.
 * These are generic patterns found across many languages and project structures.
 */
const SKIP_DIRECTORY_PREFIXES = new Set([
  ".",
  "..",
  "src",
  "lib",
  "test",
  "tests",
  "spec",
  "specs",
  "__tests__",
  "__mocks__",
  "e2e",
  "integration",
  "unit",
  "fixtures",
  "mocks",
  "dist",
  "build",
  "out",
  "bin",
]);

/**
 * Extracts a meaningful module/service name from a file path.
 * Works with any project structure by finding the first significant directory.
 *
 * @param path - The file path to extract module from
 * @returns Module name or "other" if file path is unknown/invalid
 *
 * @example
 * extractServiceFromPath('packages/shared/src/index.ts') // Returns: 'packages/shared'
 * extractServiceFromPath('src/utils/helpers.ts') // Returns: 'utils'
 * extractServiceFromPath('cmd/server/main.go') // Returns: 'cmd/server'
 * extractServiceFromPath('app/models/user.rb') // Returns: 'app/models'
 */
export const extractServiceFromPath = (path: string): string => {
  const normalizedPath = normalizeEvidencePath(path);

  // Handle unknown/missing paths
  if (!normalizedPath || normalizedPath === "unknown" || normalizedPath === "(unknown)") {
    return "other";
  }

  const parts = normalizedPath.split("/").filter((part) => part.length > 0);

  // Remove filename (last part with extension)
  const directories = parts.slice(0, -1);

  if (directories.length === 0) {
    return "other";
  }

  // Find first meaningful directory (skip common prefixes)
  const startIndex = directories.findIndex((dir) => !SKIP_DIRECTORY_PREFIXES.has(dir));
  const effectiveStart = startIndex === -1 ? 0 : startIndex;

  // Return up to 2 directory levels for context (e.g., "packages/shared" or "cmd/server")
  const meaningfulDirs = directories.slice(effectiveStart, effectiveStart + 2);
  return meaningfulDirs.length > 0 ? meaningfulDirs.join("/") : "other";
};

/**
 * Groups items by their service path for organized display.
 * Items are grouped by the service/package name extracted from their path.
 *
 * @param items - Array of items with a path property
 * @returns Map of service name to items in that service
 *
 * @example
 * const grouped = groupByServicePath([
 *   { path: 'api/users/handler.ts', message: 'error' },
 *   { path: 'web/components/button.tsx', message: 'warning' },
 * ]);
 * // Returns: Map { 'api/users' => [...], 'web/components' => [...] }
 */
export const groupByServicePath = <T extends { path: string }>(
  items: readonly T[]
): Map<string, T[]> => {
  const groups = new Map<string, T[]>();

  items.forEach((item) => {
    const service = extractServiceFromPath(item.path);
    const existing = groups.get(service) ?? [];
    groups.set(service, [...existing, item]);
  });

  return groups;
};

/**
 * Formats grouped items as markdown sections.
 * Creates a header for each service/package with file counts.
 *
 * @param grouped - Map of service name to items
 * @param formatItem - Function to format each item as a string
 * @returns Array of markdown lines with service grouping
 *
 * @example
 * const lines = formatGroupedItems(grouped, (item) => `- ${item.path}`);
 * // Returns: ['**api/users** (2 files)', '- api/users/handler.ts', ...]
 */
export const formatGroupedItems = <T extends { path: string }>(
  grouped: Map<string, T[]>,
  formatItem: (item: T) => string
): string[] => {
  const lines: string[] = [];

  grouped.forEach((items, service) => {
    const fileCount = items.length === 1 ? "1 file" : `${items.length} files`;
    lines.push(`**${service}** (${fileCount})`);
    items.forEach((item) => {
      lines.push(formatItem(item));
    });
  });

  return lines;
};

/**
 * Get the basename (file name) from a path.
 */
const getPathBasename = (path: string): string => {
  const normalizedPath = normalizeEvidencePath(path);
  const parts = normalizedPath.split("/").filter((part) => part.length > 0);
  return parts.length > 0 ? parts[parts.length - 1] : normalizedPath;
};

/**
 * Build a canonical path map to deduplicate ambiguous paths.
 * Prefers the single path that includes directories when a basename-only path exists.
 */
const buildCanonicalPathMap = (paths: readonly string[]): Map<string, string> => {
  const normalizedPaths = paths
    .map((path) => normalizeEvidencePath(path))
    .filter((path) => path.length > 0);

  const baseNameGroups = normalizedPaths.reduce<Map<string, string[]>>((groups, path) => {
    const baseName = getPathBasename(path);
    const existing = groups.get(baseName) ?? [];
    return groups.set(baseName, [...existing, path]);
  }, new Map<string, string[]>());

  const canonicalMap = new Map<string, string>();
  baseNameGroups.forEach((groupPaths) => {
    const uniquePaths = Array.from(new Set(groupPaths));
    const pathsWithDirs = uniquePaths.filter((path) => path.includes("/"));
    const canonicalPath = pathsWithDirs.length === 1 ? pathsWithDirs[0] : null;

    uniquePaths.forEach((path) => {
      if (canonicalPath && !path.includes("/")) {
        canonicalMap.set(path, canonicalPath);
        return;
      }
      canonicalMap.set(path, path);
    });
  });

  return canonicalMap;
};

/**
 * Resolve a path through the canonical map, normalizing first.
 */
const resolveCanonicalPath = (path: string, pathMap: Map<string, string>): string => {
  const normalizedPath = normalizeEvidencePath(path);
  return pathMap.get(normalizedPath) ?? normalizedPath;
};

/**
 * Canonicalize evidence paths across test failures and annotations.
 * Ensures basename-only paths are aligned to the single matching path with directories.
 */
export const canonicalizeEvidencePaths = <
  TFailure extends { file?: string },
  TAnnotation extends { path?: string },
>(
  testFailures: readonly TFailure[],
  annotations: readonly TAnnotation[]
): {
  readonly testFailures: readonly TFailure[];
  readonly annotations: readonly TAnnotation[];
  readonly pathMap: ReadonlyMap<string, string>;
} => {
  const allPaths = [
    ...testFailures.map((failure) => failure.file).filter((file): file is string => Boolean(file)),
    ...annotations
      .map((annotation) => annotation.path)
      .filter((path): path is string => Boolean(path)),
  ];

  const pathMap = buildCanonicalPathMap(allPaths);
  const canonicalTestFailures = testFailures.map((failure) => {
    if (!failure.file) {
      return failure;
    }
    const canonicalPath = resolveCanonicalPath(failure.file, pathMap);
    return canonicalPath === failure.file ? failure : { ...failure, file: canonicalPath };
  });
  const canonicalAnnotations = annotations.map((annotation) => {
    if (!annotation.path) {
      return annotation;
    }
    const canonicalPath = resolveCanonicalPath(annotation.path, pathMap);
    return canonicalPath === annotation.path ? annotation : { ...annotation, path: canonicalPath };
  });

  return {
    testFailures: canonicalTestFailures,
    annotations: canonicalAnnotations,
    pathMap,
  };
};

// ==================== Test File Detection (Language-Agnostic) ====================

/**
 * Patterns that identify test files across different languages and frameworks.
 * Supports Jest, pytest, Go, Rust, Ruby, Java, and more.
 */
const TEST_FILE_PATTERNS: readonly RegExp[] = [
  // JavaScript/TypeScript: .test.ts, .spec.ts, __tests__/
  /\.(?:test|spec)\.[jt]sx?$/i,
  /[/\\]__tests__[/\\]/i,
  // Python: test_*.py, *_test.py, tests/
  /[/\\]tests?[/\\]/i,
  /(?:^|[/\\])test_[^/\\]+\.py$/i,
  /[^/\\]+_test\.py$/i,
  // Go: *_test.go
  /_test\.go$/i,
  // Rust: mod tests, tests/ directory
  /[/\\]tests[/\\][^/\\]+\.rs$/i,
  // Ruby: *_spec.rb, *_test.rb, spec/
  /\.(?:spec|test)\.rb$/i,
  /[/\\]spec[/\\]/i,
  // Java: *Test.java, *Spec.java
  /(?:Test|Spec)\.java$/i,
  // Generic patterns
  /[/\\]test[/\\]/i,
  /[/\\]e2e[/\\]/i,
  /[/\\]integration[/\\]/i,
] as const;

/**
 * Checks if a file path appears to be a test file.
 * Language-agnostic detection supporting multiple test frameworks.
 *
 * @param filePath - The file path to check
 * @returns True if the file appears to be a test file
 */
export const isTestFile = (filePath: string): boolean =>
  TEST_FILE_PATTERNS.some((pattern) => pattern.test(filePath));

// ==================== Cause Extraction (Language-Agnostic) ====================

/**
 * Constants for cause extraction and validation.
 */
const CAUSE_EXTRACTION_LIMITS = {
  /** Maximum raw cause string length for efficient processing */
  MAX_RAW_LENGTH: 2000,
  /** Maximum display length for extracted causes */
  MAX_DISPLAY_LENGTH: 150,
  /** Truncation length (MAX_DISPLAY_LENGTH - 3 for ellipsis) */
  TRUNCATION_LENGTH: 147,
  /** Minimum length for a meaningful error line */
  MIN_MEANINGFUL_LINE_LENGTH: 10,
  /** Minimum length for a valid cause string */
  MIN_CAUSE_LENGTH: 5,
} as const;

/**
 * Patterns that indicate a cause string is not useful for display.
 * These are filtered out to show only meaningful error content.
 */
const USELESS_CAUSE_PATTERNS: readonly RegExp[] = [
  // Just a matcher name (Jest/Jasmine): toEqual, toBe, toHaveBeenCalled, toBeGreaterThan
  /^to(?:Be|Equal|Have|Throw|Match|Return|Contain|Include|Reject|Resolve)\w*$/i,
  // Jest/TS code-frame lines (e.g., "12 | const foo = bar")
  /^\s*>?\s*\d+\s*\|\s*.+$/i,
  // Multi-column code frames (e.g., "0 600 | 601 | const foo" or "> 0 600 | 601 | const foo")
  /^\s*>?\s*\d+\s+\d+\s*\|\s*\d+\s*\|/i,
  // Jest matcher template: expect(received).toBeGreaterThan(expected) - with optional whitespace
  /^expect\s*\([^)]*\)\s*\.to\w+\s*\([^)]*\)\s*$/i,
  // Any expect().toXxx pattern (more lenient)
  /^expect\s*\(.*\)\.to[A-Z]/i,
  // Just a file path without error content (with or without quotes)
  /^["']?[A-Za-z0-9_./-]+\.[a-z]{2,4}(?::\d+)?["']?\s*$/i,
  // FAIL/FAILED/PASS/PASSED followed by file path (with optional parenthetical path)
  /^(?:FAILED?|PASSED?)\s+[A-Za-z0-9_./:/-]+(?:\s*\([^)]*\))?/i,
  // FAIL marker anywhere in string followed by path
  /^FAIL\s+\S+/i,
  // Just "undefined", "null", or similar
  /^(?:undefined|null|NaN|true|false)$/i,
  // Just empty object/array representations
  /^(?:\{\}|\[\]|Object|Array)$/i,
  // Just test runner markers (FAIL, FAILED, PASS, PASSED, etc.)
  /^(?:FAILED?|PASSED?|✓|✕|●)\s*$/,
  // Just a test name (looks like "should do something" or "it does thing")
  /^(?:should|it|test|describe|when|given)\s+[\w\s]+$/i,
  // Just assertion count
  /^\d+\s+(?:passing|failing|pending|skipped)/i,
  // Just a function/method name (single word)
  /^[a-zA-Z_]\w*$/,
  // Jest/Mocha snapshot markers
  /^(?:Snapshot|Snapshots?):/i,
  // Python pytest markers (standalone)
  /^(?:PASSED|FAILED|ERROR|SKIPPED)$/i,
  // Go test markers
  /^(?:---\s*(?:PASS|FAIL)|===\s*(?:RUN|PAUSE|CONT))/i,
  // Just "Error:" or "Error" with optional whitespace
  /^Error:?\s*$/i,
  // Substring/contains patterns: substring: "anything"
  /^substring:\s*/i,
  // Number of calls pattern: number of calls: N
  /^number of calls:\s*\d+$/i,
  // Just timing info: (10.243 s) or (10.243 ms) with space before unit
  /^\(\d+\.?\d*\s*(?:ms|s|m)?\s*\)$/i,
  // Just a short quoted string (less than 50 chars, likely a value not an error)
  /^["'][^"']{1,50}["']$/,
  // ObjectContaining/StringContaining patterns (anywhere in string)
  /(?:Object|String|Array)Containing\s*[{[]/i,
  // Just "Test failed:" prefix without content
  /^Test failed:?\s*$/i,
  // Function mockConstructor patterns (anywhere in string)
  /\[Function[:\s]*\w*\]/i,
  // JSON-like objects with Function references
  /\{[^}]*\[Function/i,
  // Just quoted file paths
  /^["'][A-Za-z0-9_./-]+(?:\/[A-Za-z0-9_./-]+)*\.[a-z]{2,4}["']$/i,
  // Jest received/expected without actual values or with just primitive values
  /^(?:Received|Expected):\s*$/i,
  // Jest received/expected with just primitive value (undefined, null, true, false, number)
  /^(?:Received|Expected):\s*(?:undefined|null|true|false|-?\d+\.?\d*)\s*$/i,
  // Just a file path (any directory structure) shown as error - matches path/to/file patterns
  /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/,
  // Test identifiers with :: separator (Python, Rust, C++): TestClass::test_method
  /^[A-Za-z_]\w*(?:::[A-Za-z_]\w*)+$/,
  // Test identifiers with > separator (Jest): describe > test name
  /^[A-Za-z_][\w\s]*(?:\s*>\s*[A-Za-z_][\w\s]*)+$/,
  // Test identifiers with / separator (Go): TestPackage/TestName
  /^Test[A-Za-z_]\w*(?:\/[A-Za-z_]\w*)+$/,
  // File path with any test identifier: path/file.ext::Class::method or path/file.ext > describe
  /^[A-Za-z0-9_./-]+\.[a-z]{2,4}(?:::|\/|>)[A-Za-z_]\w*/i,
  // CamelCase test class/method names without actual error content: TestSomething, test_something
  /^(?:Test|test_)[A-Za-z0-9_]+$/,
  // Generic explanation messages that don't contain actual error content
  /^This error indicates/i,
  // Test failed with just file path
  /^Test failed:\s*[A-Za-z0-9_./-]+\.[a-z]{2,4}/i,
  // Jest caret marker lines (| ^ or | ^) indicating source position
  /\|\s*\^/,
  // Lines containing PASS followed by test file paths
  /PASS\s+[\w/.-]+\.(?:test|spec)\.[jt]sx?/i,
  // Quoted file path followed by pipe (e.g., "src/utils.test.ts" |)
  /^["'][^"']+["']\s*\|/,
  // Lines that are mostly PASS/FAIL markers with paths
  /^[|>\s]*(?:PASS|FAIL)\s+\S+/i,
  // JSON log objects (structured logging output) - matches {"level": or {"message": etc.
  /^\s*\{["'](?:level|message|timestamp|error|status|code)["']\s*:/i,
  // JSON arrays or objects at start of line (raw log output)
  /^\s*[[{].*["'](?:level|message|error|status)["']/i,
  // Generic "assertion failed" without specific content
  /^assertion\s+failed\.?$/i,
  // Just "Test failed" without real error context
  /^Test\s+failed\.?\s*$/i,
  // Very long Received: strings that contain newlines or system prompt indicators
  /^Received:\s*["'].*(?:You are|Instructions:|system prompt|assistant)/is,
  // Received: with extremely long quoted strings (likely dumped content)
  /^Received:\s*["'][^"']{200,}/i,
  // Expected/Received blocks that just show large objects
  /^(?:Expected|Received):\s*\{[^}]{100,}/i,
  // Lines that are just stringified objects starting with Object
  /^Object\s*\{/i,
  // Lines that start with Array followed by bracket
  /^Array\s*\[/i,
  // Raw stringified JSON with backslash escapes (e.g., {\"key\":\"value\"}
  /^\{\\["'].*\\["']\s*:/,
] as const;

/**
 * Checks if a cause string is useless for display.
 *
 * @param cause - The cause string to check
 * @returns True if the cause should be filtered out
 */
const isCauseUseless = (cause: string): boolean => {
  const trimmed = cause.trim();
  const normalized = trimmed
    .replace(/^[\s*•-]+/, "")
    .replace(/^[✕✗×●]+\s*/i, "")
    .trim();
  if (normalized.length < CAUSE_EXTRACTION_LIMITS.MIN_CAUSE_LENGTH) {
    return true;
  }
  return USELESS_CAUSE_PATTERNS.some((pattern) => pattern.test(normalized));
};

/**
 * Extracts a meaningful error cause from raw error text.
 * Uses language-agnostic patterns to find actual assertion failures,
 * expected/received values, and error messages.
 *
 * @param rawError - The raw error text (may contain test names, stack traces, etc.)
 * @returns Extracted meaningful cause or null if no useful content found
 */
export const extractMeaningfulCause = (rawError: string): string | null => {
  if (!rawError || rawError.trim().length === 0) {
    return null;
  }

  // Truncate very long errors for efficiency
  const trimmed = rawError.slice(0, CAUSE_EXTRACTION_LIMITS.MAX_RAW_LENGTH).trim();

  // First try the assertion snippet extractor (handles expected/received patterns)
  const assertionSnippet = extractAssertionSnippet(trimmed);
  if (assertionSnippet && !isCauseUseless(assertionSnippet)) {
    return assertionSnippet;
  }

  // Fall back to finding first meaningful line
  const lines = trimmed.split(/\n/).map((line) => line.trim());
  const meaningfulLine = lines.find(
    (line) =>
      line.length > CAUSE_EXTRACTION_LIMITS.MIN_MEANINGFUL_LINE_LENGTH &&
      !isGenericErrorLine(line) &&
      !isCauseUseless(line)
  );

  if (meaningfulLine) {
    // Truncate to reasonable display length
    return meaningfulLine.length > CAUSE_EXTRACTION_LIMITS.MAX_DISPLAY_LENGTH
      ? `${meaningfulLine.slice(0, CAUSE_EXTRACTION_LIMITS.TRUNCATION_LENGTH)}...`
      : meaningfulLine;
  }

  return null;
};

/**
 * Sanitizes a test failure message for display without truncation.
 * Removes evidence prefixes, file-level markers, and boilerplate lines.
 */
export const sanitizeTestFailureMessage = (message: string): string => {
  if (!message) {
    return "";
  }

  const stripCodeFrameFragment = (line: string): string => {
    const match = line.match(/\b\d+\s*\|/);
    if (!match || match.index === undefined) {
      return line;
    }
    const prefix = line.slice(0, match.index).trim();
    if (prefix.length < 3 || /^\d+$/.test(prefix)) {
      return "";
    }
    return prefix;
  };

  const stripped = message
    .replace(TEXT_SANITIZATION_PATTERNS.ANSI_ESCAPE_CODES, "")
    .replace(FILE_PATH_VALIDATION.EVIDENCE_PREFIX_PATTERN, "")
    .replace(/^Test failed:\s*/i, "")
    .trim();

  const lines = stripped
    .split("\n")
    .map((line) => stripCodeFrameFragment(line.trim()))
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const meaningfulLines = lines.filter(
    (line) => !isGenericErrorLine(line) && !isCauseUseless(line)
  );

  if (meaningfulLines.length === 0) {
    return "";
  }

  return meaningfulLines.join(" ").replace(/\s+/g, " ").trim();
};

// ==================== Failure Classification (Phase 8) ====================

/**
 * Patterns used to rank cause strings by signal strength.
 */
const CAUSE_SIGNAL_WEIGHTS: ReadonlyArray<{ pattern: RegExp; weight: number }> = [
  { pattern: /\b(typeerror|referenceerror|validationerror|syntaxerror)\b/i, weight: 6 },
  { pattern: /\bnot initialized\b/i, weight: 6 },
  { pattern: /\bnot a function\b/i, weight: 6 },
  { pattern: /\bcannot read (properties|property)\b/i, weight: 5 },
  { pattern: /\bundefined\b/i, weight: 4 },
  { pattern: /\bnull\b/i, weight: 3 },
  { pattern: /\btimeout|timed out|exceeded \d+m?s\b/i, weight: 5 },
  { pattern: /\b(out of memory|oom|no space left)\b/i, weight: 5 },
  { pattern: /\b(database|db|pool|connection|redis)\b/i, weight: 4 },
  { pattern: /\bpermission denied|unauthorized|forbidden|401|403\b/i, weight: 4 },
  { pattern: /\bmodule not found|cannot find module|importerror\b/i, weight: 4 },
];

const CAUSE_WEAKNESS_WEIGHTS: ReadonlyArray<{ pattern: RegExp; weight: number }> = [
  { pattern: /\bexpected\b/i, weight: -2 },
  { pattern: /\breceived\b/i, weight: -2 },
  { pattern: /\bsubstring\b/i, weight: -2 },
  { pattern: /\btoBe|toEqual|toHave|toMatch|toContain\b/i, weight: -2 },
  { pattern: /^\s*expected:\s*$/i, weight: -4 },
  { pattern: /^\s*received:\s*$/i, weight: -4 },
  { pattern: /^(?:fail(?:ed)?|test failed)\b/i, weight: -5 },
];

/**
 * Scores a cause string based on signal strength.
 */
const scoreCause = (cause: string): number => {
  const trimmed = cause.trim();
  if (!trimmed) {
    return 0;
  }

  let score = 0;
  CAUSE_SIGNAL_WEIGHTS.forEach((rule) => {
    if (rule.pattern.test(trimmed)) {
      score += rule.weight;
    }
  });
  CAUSE_WEAKNESS_WEIGHTS.forEach((rule) => {
    if (rule.pattern.test(trimmed)) {
      score += rule.weight;
    }
  });

  if (trimmed.length >= 60) {
    score += 1;
  }
  if (trimmed.length >= 120) {
    score += 1;
  }

  return score;
};

/**
 * Returns true when a cause looks like a low-signal assertion-only message.
 * Used to hide noisy "expected/received" strings in summaries.
 */
export const isLowSignalCause = (cause: string): boolean => {
  const trimmed = cause.trim();
  if (!trimmed) {
    return true;
  }

  if (isCauseUseless(trimmed)) {
    return true;
  }

  const hasSignal = CAUSE_SIGNAL_WEIGHTS.some((rule) => rule.pattern.test(trimmed));
  const hasWeakness = CAUSE_WEAKNESS_WEIGHTS.some((rule) => rule.pattern.test(trimmed));

  return hasWeakness && !hasSignal;
};

/**
 * Failure classification types for separating infrastructure issues from assertions.
 */
export type FailureClassificationType = "assertion" | "timeout" | "infra";

/**
 * Pattern for timeout errors in test failure messages.
 */
const TIMEOUT_PATTERN = /timeout|timed out|exceeded \d+m?s/i;

/**
 * Classifies a test failure as assertion, timeout, or infrastructure issue.
 * Used to separate infrastructure problems from actual test failures.
 *
 * @param testFailure - Test failure with optional error message
 * @returns Classification: "assertion", "timeout", or "infra"
 *
 * @example
 * classifyTestFailure({ testName: 'test', error: 'Timeout exceeded 5000ms' })
 * // Returns: 'timeout'
 */
export const classifyTestFailure = <T extends { error?: string }>(
  testFailure: T
): FailureClassificationType => {
  const error = testFailure.error?.toLowerCase() ?? "";

  // Check for timeout patterns first (most specific)
  if (TIMEOUT_PATTERN.test(error)) {
    return "timeout";
  }

  // Check against infrastructure patterns
  if (INFRA_PATTERNS.some((pattern) => pattern.test(error))) {
    return "infra";
  }

  // Default to assertion failure
  return "assertion";
};

/**
 * Result of partitioning failures by type.
 */
export interface PartitionedFailures<T> {
  readonly assertions: readonly T[];
  readonly timeouts: readonly T[];
  readonly infra: readonly T[];
}

/**
 * Maps classification type to partition key.
 */
const CLASSIFICATION_TO_KEY: Record<FailureClassificationType, keyof PartitionedFailures<unknown>> =
  {
    assertion: "assertions",
    timeout: "timeouts",
    infra: "infra",
  } as const;

/**
 * Partitions test failures by their classification type.
 * Separates infrastructure issues and timeouts from assertion failures.
 *
 * @param failures - Array of failures to partition
 * @returns Object with assertions, timeouts, and infra arrays
 *
 * @example
 * const { assertions, timeouts, infra } = partitionByFailureType(failures);
 * // assertions: test failures, timeouts: timeout failures, infra: OOM/network issues
 */
export const partitionByFailureType = <T extends { error?: string }>(
  failures: readonly T[]
): PartitionedFailures<T> =>
  failures.reduce<PartitionedFailures<T>>(
    (accumulator, failure) => {
      const classification = classifyTestFailure(failure);
      const key = CLASSIFICATION_TO_KEY[classification];
      return {
        ...accumulator,
        [key]: [...accumulator[key], failure],
      };
    },
    { assertions: [], timeouts: [], infra: [] }
  );

// ==================== Suite Counting (Phase 2) ====================

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

// ==================== Evidence ID Helpers (Phase 5) ====================

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

// ==================== Failure Clustering (Phase 1) ====================

/**
 * Represents a cluster of failures grouped by service.
 */
export interface FailureCluster {
  readonly service: string;
  readonly causes: readonly string[];
  readonly uniqueFileCount: number;
  readonly testFailureCount: number;
  readonly annotationCount: number;
  readonly primaryError?: string;
  readonly primaryFile?: string;
  readonly primaryLine?: number;
  readonly primaryTestName?: string;
  readonly evidenceIds: readonly string[];
  readonly isInfra: boolean;
}

/**
 * Returns true when a cluster has evidence-backed failures (tests or annotations).
 */
export const isEvidenceBackedCluster = (cluster: FailureCluster): boolean =>
  cluster.testFailureCount > 0 || cluster.annotationCount > 0 || cluster.uniqueFileCount > 0;

/**
 * Root cause summary entry for shared formatting.
 */
export interface RootCauseSummaryEntry {
  readonly service: string;
  readonly cause?: string;
  readonly location?: string | null;
  readonly evidenceIds: readonly string[];
  readonly isInfra: boolean;
  readonly fileCount: number;
  readonly primaryTestName?: string;
}

/**
 * Summary of root cause clusters used by Slack and GitHub formatters.
 */
export interface RootCauseSummary {
  readonly entries: readonly RootCauseSummaryEntry[];
  readonly lowSignalCount: number;
  readonly hiddenCount: number;
  readonly hasInfra: boolean;
  readonly totalClusters: number;
}

/**
 * Selects the best (highest-signal) cause for a cluster.
 */
export const selectBestClusterCause = (cluster: FailureCluster): string | undefined => {
  const candidates = Array.from(
    new Set([...cluster.causes, cluster.primaryError ?? ""].filter((cause) => cause.length > 0))
  );
  if (candidates.length === 0) {
    return undefined;
  }
  return candidates
    .sort((left, right) => {
      const scoreDiff = scoreCause(right) - scoreCause(left);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      return right.length - left.length;
    })
    .find((candidate) => candidate.length > 0);
};

/**
 * Scores a failure cluster by its strongest cause signal.
 */
export const scoreClusterSignal = (cluster: FailureCluster): number => {
  const bestCause = selectBestClusterCause(cluster);
  return bestCause ? scoreCause(bestCause) : 0;
};

/**
 * Internal accumulator state for building clusters.
 * Uses Sets for deduplication during construction.
 */
interface ClusterAccumulator {
  readonly service: string;
  readonly causes: Set<string>;
  readonly uniqueFiles: Set<string>;
  readonly evidenceIds: Set<string>;
  testFailureCount: number;
  annotationCount: number;
  primaryError?: string;
  primaryFile?: string;
  primaryLine?: number;
  primaryTestName?: string;
  primaryScore: number;
  isInfra: boolean;
}

/**
 * Creates an empty cluster accumulator for a service.
 */
const createEmptyAccumulator = (service: string): ClusterAccumulator => ({
  service,
  causes: new Set(),
  uniqueFiles: new Set(),
  evidenceIds: new Set(),
  testFailureCount: 0,
  annotationCount: 0,
  primaryError: undefined,
  primaryFile: undefined,
  primaryLine: undefined,
  primaryTestName: undefined,
  primaryScore: Number.NEGATIVE_INFINITY,
  isInfra: false,
});

/**
 * Updates the primary evidence details when a higher-signal cause is found.
 */
const updatePrimaryEvidence = (
  accumulator: ClusterAccumulator,
  candidate: {
    readonly cause: string;
    readonly file?: string;
    readonly line?: number;
    readonly testName?: string;
  }
): void => {
  if (!candidate.cause) {
    return;
  }

  const candidateScore = scoreCause(candidate.cause);
  const shouldReplace =
    candidateScore > accumulator.primaryScore ||
    (candidateScore === accumulator.primaryScore &&
      !accumulator.primaryFile &&
      Boolean(candidate.file));

  if (!shouldReplace) {
    return;
  }

  accumulator.primaryScore = candidateScore;
  accumulator.primaryError = candidate.cause;
  accumulator.primaryFile = candidate.file;
  accumulator.primaryLine = candidate.line;
  accumulator.primaryTestName = candidate.testName;
};

/**
 * Converts an accumulator to a readonly FailureCluster.
 */
const accumulatorToCluster = (accumulator: ClusterAccumulator): FailureCluster => ({
  service: accumulator.service,
  causes: Array.from(accumulator.causes),
  uniqueFileCount: accumulator.uniqueFiles.size,
  testFailureCount: accumulator.testFailureCount,
  annotationCount: accumulator.annotationCount,
  primaryError: accumulator.primaryError,
  primaryFile: accumulator.primaryFile,
  primaryLine: accumulator.primaryLine,
  primaryTestName: accumulator.primaryTestName,
  evidenceIds: Array.from(accumulator.evidenceIds),
  isInfra: accumulator.isInfra,
});

/**
 * Analyzed failure interface for clustering.
 * Matches the AnalyzedFailure type from core/types.
 */
export interface ClusterableFailure {
  readonly identifiedCause?: string;
  readonly analysis?: string;
  readonly testFailures?: ReadonlyArray<{
    file?: string;
    line?: number;
    error?: string;
    testName?: string;
  }>;
  readonly annotations?: ReadonlyArray<{ path: string; line?: number; message?: string }>;
}

/**
 * Clusters analyzed failures by their service/package.
 * Groups failures by EACH file's service (not by check's primary service).
 * Deduplicates files across checks to prevent double-counting.
 *
 * @param failures - Array of analyzed failures to cluster
 * @returns Map of service name to failure cluster info
 *
 * @example
 * const clusters = clusterFailuresByService(failures);
 * // Map { 'api/users' => { uniqueFileCount: 12, ... }, 'web/auth' => { uniqueFileCount: 8, ... } }
 */
export const clusterFailuresByService = (
  failures: readonly ClusterableFailure[]
): Map<string, FailureCluster> => {
  const accumulators = new Map<string, ClusterAccumulator>();
  const seenFileKeys = new Set<string>();
  const allPaths = [
    ...failures.flatMap((failure) =>
      (failure.testFailures ?? [])
        .map((testFailure) => testFailure.file)
        .filter((file): file is string => Boolean(file))
    ),
    ...failures.flatMap((failure) =>
      (failure.annotations ?? [])
        .map((annotation) => annotation.path)
        .filter((path): path is string => Boolean(path))
    ),
  ];
  const pathMap = buildCanonicalPathMap(allPaths);

  failures.forEach((failure, checkIndex) => {
    const checkEvidenceId = generateCheckEvidenceId(checkIndex);
    const checkCause = failure.identifiedCause ?? failure.analysis ?? "";
    const hasEvidence =
      (failure.testFailures?.length ?? 0) > 0 || (failure.annotations?.length ?? 0) > 0;

    // Process each test failure individually - cluster by ITS file's service
    (failure.testFailures ?? []).forEach((testFailure) => {
      if (!testFailure.file) {
        return;
      }

      // Deduplicate by file+line across all checks
      const normalizedFile = resolveCanonicalPath(testFailure.file, pathMap);
      if (!FILE_PATH_VALIDATION.VALID_PATH_PATTERN.test(normalizedFile)) {
        return;
      }
      const fileKey = `${normalizedFile}:${testFailure.line ?? 0}`;
      if (seenFileKeys.has(fileKey)) {
        return;
      }
      seenFileKeys.add(fileKey);

      // Get service for THIS specific file
      const service = extractServiceFromPath(normalizedFile);
      const accumulator = accumulators.get(service) ?? createEmptyAccumulator(service);

      // Classify failure type
      const failureType = classifyTestFailure(testFailure);
      const isInfraOrTimeout = failureType === "infra" || failureType === "timeout";

      // Extract meaningful cause from error text, filtering out test names and useless content
      const sanitizedError = testFailure.error ? sanitizeTestFailureMessage(testFailure.error) : "";
      const meaningfulCause = sanitizedError
        ? (extractMeaningfulCause(sanitizedError) ?? sanitizedError)
        : null;
      if (meaningfulCause) {
        accumulator.causes.add(meaningfulCause);
        updatePrimaryEvidence(accumulator, {
          cause: meaningfulCause,
          file: normalizedFile,
          line: testFailure.line,
          testName: testFailure.testName,
        });
      }

      accumulator.uniqueFiles.add(normalizedFile);
      accumulator.testFailureCount += 1;
      accumulator.evidenceIds.add(checkEvidenceId);
      if (
        !accumulator.primaryTestName &&
        testFailure.testName &&
        !isTestFile(testFailure.testName)
      ) {
        accumulator.primaryTestName = testFailure.testName;
      }
      if (!accumulator.primaryFile) {
        accumulator.primaryFile = normalizedFile;
        accumulator.primaryLine = testFailure.line;
      }
      accumulator.isInfra = accumulator.isInfra || isInfraOrTimeout;

      accumulators.set(service, accumulator);
    });

    // Process annotations similarly
    (failure.annotations ?? []).forEach((annotation) => {
      if (!annotation.path) {
        return;
      }

      // Deduplicate by path+line
      const normalizedPath = resolveCanonicalPath(annotation.path, pathMap);
      if (!FILE_PATH_VALIDATION.VALID_PATH_PATTERN.test(normalizedPath)) {
        return;
      }
      const fileKey = `${normalizedPath}:${annotation.line ?? 0}`;
      if (seenFileKeys.has(fileKey)) {
        return;
      }
      seenFileKeys.add(fileKey);

      const service = extractServiceFromPath(normalizedPath);
      const accumulator = accumulators.get(service) ?? createEmptyAccumulator(service);

      const annotationCause = extractMeaningfulCause(annotation.message ?? "");
      if (annotationCause) {
        accumulator.causes.add(annotationCause);
        updatePrimaryEvidence(accumulator, {
          cause: annotationCause,
          file: normalizedPath,
          line: annotation.line,
        });
      }

      accumulator.uniqueFiles.add(normalizedPath);
      accumulator.annotationCount += 1;
      accumulator.evidenceIds.add(checkEvidenceId);

      accumulators.set(service, accumulator);
    });

    if (!hasEvidence && checkCause) {
      const meaningfulCheckCause = extractMeaningfulCause(checkCause);
      if (meaningfulCheckCause) {
        const accumulator = accumulators.get("other") ?? createEmptyAccumulator("other");
        accumulator.causes.add(meaningfulCheckCause);
        accumulator.evidenceIds.add(checkEvidenceId);
        updatePrimaryEvidence(accumulator, { cause: meaningfulCheckCause });
        accumulators.set("other", accumulator);
      }
    }
  });

  // Convert accumulators to readonly FailureClusters
  const clusters = new Map<string, FailureCluster>();
  accumulators.forEach((accumulator, service) => {
    clusters.set(service, accumulatorToCluster(accumulator));
  });

  return clusters;
};

/**
 * Summarizes root cause clusters for consistent Slack/GitHub formatting.
 */
export const summarizeRootCauses = (
  failures: readonly ClusterableFailure[],
  options?: { readonly maxEntries?: number }
): RootCauseSummary => {
  const clusters = clusterFailuresByService(failures);
  const evidenceClusters = Array.from(clusters.values()).filter((cluster) =>
    isEvidenceBackedCluster(cluster)
  );
  const clustersToUse =
    evidenceClusters.length > 0 ? evidenceClusters : Array.from(clusters.values());
  const totalClusters = clustersToUse.length;

  const entriesWithSignal = clustersToUse.map((cluster) => {
    const bestCause = selectBestClusterCause(cluster);
    const isLowSignal = !bestCause || isLowSignalCause(bestCause);
    return { cluster, bestCause, isLowSignal };
  });

  const highSignal = entriesWithSignal.filter((entry) => !entry.isLowSignal);
  const lowSignalCount = entriesWithSignal.length - highSignal.length;

  const sortedHighSignal = highSignal.sort((left, right) => {
    const scoreDiff = scoreClusterSignal(right.cluster) - scoreClusterSignal(left.cluster);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return right.cluster.uniqueFileCount - left.cluster.uniqueFileCount;
  });

  const maxEntries = options?.maxEntries ?? FORMATTER_DISPLAY_LIMITS.MAX_ROOT_CAUSES;
  const selected = sortedHighSignal.slice(0, maxEntries);
  const hiddenCount = Math.max(0, sortedHighSignal.length - selected.length);

  const entries: RootCauseSummaryEntry[] = selected.map(({ cluster, bestCause }) => ({
    service: cluster.service,
    cause: bestCause && !isLowSignalCause(bestCause) ? bestCause : undefined,
    location: formatEvidenceLocation(cluster.primaryFile, cluster.primaryLine),
    evidenceIds: cluster.evidenceIds,
    isInfra: cluster.isInfra,
    fileCount: cluster.uniqueFileCount,
    primaryTestName: cluster.primaryTestName,
  }));

  return {
    entries,
    lowSignalCount,
    hiddenCount,
    hasInfra: clustersToUse.some((cluster) => cluster.isInfra),
    totalClusters,
  };
};
