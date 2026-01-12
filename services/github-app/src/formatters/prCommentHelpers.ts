/**
 * PR Comment Helpers
 *
 * Helper functions for PR comment formatting.
 * Includes path validation, message normalization, and consolidation utilities.
 */

import {
  GITHUB_COMMENT_DISPLAY,
  FILE_PATH_VALIDATION,
  truncateText,
  normalizeTestFilePath,
  extractMeaningfulCause,
  deduplicateByKey,
  normalizeTestFailure,
  type CodeAnnotation,
} from "@kenchi/shared";
import type {
  ConsolidatedTestFailure,
  ConsolidatedAnnotation,
  AffectedFileEntry,
  GroupedFileEntries,
} from "./prCommentTypes.js";

// ==================== Message Helpers ====================

const stripEvidencePrefix = (message: string): string =>
  message.replace(FILE_PATH_VALIDATION.EVIDENCE_PREFIX_PATTERN, "");

/**
 * Normalizes annotation/error message for display.
 * Uses extractMeaningfulCause to find meaningful assertion details,
 * filtering out useless content like matcher names and test runner markers.
 */
export const normalizeAnnotationMessage = (message: string): string => {
  const stripped = stripEvidencePrefix(message).trim();
  const meaningful = extractMeaningfulCause(stripped);
  if (meaningful && meaningful.length > 5) {
    return truncateText(meaningful, GITHUB_COMMENT_DISPLAY.MAX_ANNOTATION_MESSAGE_LENGTH);
  }
  return "";
};

// ==================== Path Validation ====================

/**
 * Extracts and validates file location from annotation path and line.
 * Returns null if the path doesn't look like a valid file path.
 * Handles cases where error text is accidentally included in the path field.
 *
 * @param path - Raw path string from annotation
 * @param line - Line number from annotation
 * @returns Formatted location string (e.g., "src/index.ts:42") or null if invalid
 */
export const extractValidFileLocation = (path: string, line: number): string | null => {
  if (!path || path === "unknown" || path.length > GITHUB_COMMENT_DISPLAY.MAX_FILE_PATH_LENGTH) {
    return null;
  }

  const trimmedPath = path.trim();

  // Try to extract file:line pattern from the path itself (handles embedded line numbers)
  const embeddedMatch = trimmedPath.match(FILE_PATH_VALIDATION.LOCATION_PATTERN);
  if (embeddedMatch) {
    const extractedPath = embeddedMatch[1];
    const extractedLine = parseInt(embeddedMatch[2], 10);
    if (FILE_PATH_VALIDATION.VALID_PATH_PATTERN.test(extractedPath)) {
      return `${extractedPath}:${extractedLine}`;
    }
  }

  // Validate the path looks like a real file path (not error text)
  if (!FILE_PATH_VALIDATION.VALID_PATH_PATTERN.test(trimmedPath)) {
    return null;
  }

  // Return path with line if valid
  return line > 0 ? `${trimmedPath}:${line}` : trimmedPath;
};

/**
 * Counts unique, displayable file paths from annotations and test failures.
 * Uses the same path validation logic as the Affected Files section.
 */
export const countDisplayableFiles = (
  annotations: readonly ConsolidatedAnnotation[],
  testFailures: readonly ConsolidatedTestFailure[]
): number => {
  const uniqueFiles = new Set<string>();

  annotations.forEach((annotation) => {
    const location = extractValidFileLocation(annotation.path, annotation.line);
    if (location) {
      const path = normalizeTestFilePath(location.split(":")[0] ?? annotation.path);
      uniqueFiles.add(path);
    }
  });

  testFailures.forEach((testFailure) => {
    if (!testFailure.file) {
      return;
    }
    const location = extractValidFileLocation(testFailure.file, testFailure.line ?? 0);
    if (location) {
      const path = normalizeTestFilePath(location.split(":")[0] ?? testFailure.file);
      uniqueFiles.add(path);
    }
  });

  return uniqueFiles.size;
};

// ==================== Consolidation ====================

/**
 * Consolidate test failures across checks using Map-based deduplication.
 * Deduplicates by file:line to show each location once.
 * Keeps the entry with the most informative error (sorted first).
 */
export const consolidateTestFailures = (
  testFailures: readonly ConsolidatedTestFailure[]
): ConsolidatedTestFailure[] => {
  const allFailures = [...testFailures];

  // Sort to prioritize entries with meaningful errors
  const sorted = [...allFailures].sort(
    (left, right) => Number(Boolean(right.error)) - Number(Boolean(left.error))
  );

  // Normalize first, then deduplicate by file:line
  const normalized = sorted.map((testFailure) => normalizeTestFailure(testFailure));

  return deduplicateByKey(normalized, (testFailure) => {
    // Deduplicate by file:line to show each location once
    const file = testFailure.file ?? "";
    const line = testFailure.line ?? 0;
    return file ? `${file}:${line}` : testFailure.testName;
  });
};

/**
 * Consolidate annotations across checks using Map-based deduplication.
 * Shows ALL annotations - language agnostic, no path exclusions.
 */
export const consolidateAnnotations = (
  annotations: readonly CodeAnnotation[]
): ConsolidatedAnnotation[] =>
  deduplicateByKey(annotations, (annotation) => `${annotation.path}:${annotation.line}`).map(
    (annotation) => ({
      path: annotation.path,
      line: annotation.line,
      message: annotation.message,
      level: annotation.level,
      title: annotation.title,
      suggestedFix: annotation.suggestedFix?.description,
    })
  );

// ==================== Grouping ====================

/**
 * Groups affected file entries by file path.
 * Used to show count when multiple assertions in same file.
 */
export const groupEntriesByFile = (entries: readonly AffectedFileEntry[]): GroupedFileEntries[] => {
  const groups = new Map<string, AffectedFileEntry[]>();

  entries.forEach((entry) => {
    const file = entry.path;
    const existing = groups.get(file) ?? [];
    groups.set(file, [...existing, entry]);
  });

  return Array.from(groups.entries()).map(([file, groupedEntries]) => ({
    file,
    entries: groupedEntries,
  }));
};
