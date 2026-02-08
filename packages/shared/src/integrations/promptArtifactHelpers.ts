/**
 * Artifact Analysis Helpers
 *
 * Pure utility functions for formatting artifacts and build metadata
 * into prompt-ready text. Used by the Stage 4 prompt builder.
 *
 * @module integrations/promptArtifactHelpers
 */

import type { RankedArtifact } from "../formatting/aggregation/index.js";
import type { BuildMetadata } from "../formatting/analysis/index.js";

// ==================== Constants ====================

/** Maximum characters for error message in prompt (single line) */
const MAX_MESSAGE_LENGTH = 500;

/** Maximum characters for snippet in prompt */
const MAX_SNIPPET_LENGTH = 2000;

/** Ratio of head to tail in middle truncation (60% head, 40% tail) */
const TRUNCATE_HEAD_RATIO = 0.6;

/** Minimum length for middle truncation to be meaningful */
const MIN_MIDDLE_TRUNCATE_LENGTH = 50;

/** Truncation marker for middle truncation */
const TRUNCATE_MARKER = "\n...[TRUNCATED]...\n";

/** Maximum characters for degraded mode raw log preview */
export const MAX_RAW_LOG_PREVIEW_LENGTH = 3000;

// ==================== Text Helpers ====================

/**
 * Normalizes text to single line for prompt field values.
 */
const toSingleLine = (text: string): string =>
  text
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Truncates text to max length with ellipsis.
 * Handles edge cases where maxLength is very small.
 */
const truncateText = (text: string, maxLength: number): string => {
  if (maxLength <= 0) {
    return "";
  }
  if (text.length <= maxLength) {
    return text;
  }
  if (maxLength <= 3) {
    return ".".repeat(maxLength);
  }
  return `${text.slice(0, maxLength - 3)}...`;
};

/**
 * Truncates text preserving both head and tail content.
 * Important for snippets where the actual error may be at the end
 * (Jest summaries, "Caused by" chains, stack trace tails).
 */
export const truncateMiddle = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }
  if (maxLength <= MIN_MIDDLE_TRUNCATE_LENGTH) {
    return truncateText(text, maxLength);
  }

  const markerLength = TRUNCATE_MARKER.length;
  const contentLength = maxLength - markerLength;
  const headLength = Math.floor(contentLength * TRUNCATE_HEAD_RATIO);
  const tailLength = contentLength - headLength;

  return `${text.slice(0, headLength)}${TRUNCATE_MARKER}${text.slice(-tailLength)}`;
};

/**
 * Sanitizes delimiter tokens inside content to prevent record format breakage.
 * Artifacts may contain text that looks like our delimiters.
 */
const sanitizeDelimiters = (text: string): string =>
  text
    .replaceAll("SNIPPET_BEGIN", "[SNIPPET_BEGIN]")
    .replaceAll("SNIPPET_END", "[SNIPPET_END]")
    .replaceAll("BEGIN_UNTRUSTED_DATA", "[BEGIN_UNTRUSTED_DATA]")
    .replaceAll("END_UNTRUSTED_DATA", "[END_UNTRUSTED_DATA]");

// ==================== Counting Helpers ====================

/**
 * Counts artifacts that should produce test_failures entries.
 * An artifact qualifies if type is "test_failure" OR it has a testName field.
 */
export const countTestArtifacts = (artifacts: readonly RankedArtifact[]): number =>
  artifacts.filter(
    (artifact) => artifact.type === "test_failure" || artifact.testName !== undefined
  ).length;

/**
 * Counts artifacts that should produce lint_errors entries.
 * Matches lint_error and compiler_error types.
 */
export const countLintArtifacts = (artifacts: readonly RankedArtifact[]): number =>
  artifacts.filter(
    (artifact) => artifact.type === "lint_error" || artifact.type === "compiler_error"
  ).length;

// ==================== Artifact Formatters ====================

/**
 * Formats ranked artifacts for the final analyzer prompt.
 * Applies hard caps on snippet/message length as last line of defense.
 * Uses the artifact id as the section header to eliminate ID confusion.
 *
 * @param artifacts - Ranked artifacts from aggregation
 * @returns Formatted artifacts section
 */
export const formatRankedArtifacts = (artifacts: readonly RankedArtifact[]): string => {
  if (artifacts.length === 0) {
    return "No artifacts were extracted from the logs.";
  }

  const formattedArtifacts = artifacts.map((artifact) => {
    const normalizedMessage = truncateText(toSingleLine(artifact.errorMessage), MAX_MESSAGE_LENGTH);

    const sanitizedSnippet = sanitizeDelimiters(artifact.snippet);
    const truncatedSnippet = truncateMiddle(sanitizedSnippet, MAX_SNIPPET_LENGTH);

    const lines = [
      `=== ${artifact.absoluteEvidenceId} ===`,
      `type: ${artifact.type}`,
      `severity: ${artifact.severity}`,
      `priority_score: ${artifact.priorityScore}`,
      `confidence: ${artifact.confidence}`,
      `first_chunk: ${artifact.firstOccurrenceChunk}`,
      artifact.occurrenceCount > 1 ? `occurrences: ${artifact.occurrenceCount}` : "",
      artifact.filePath ? `file: ${artifact.filePath}` : "",
      artifact.lineNumber === undefined || artifact.lineNumber === null
        ? ""
        : `line: ${artifact.lineNumber}`,
      artifact.testName ? `test: ${artifact.testName}` : "",
      artifact.testSuite ? `suite: ${artifact.testSuite}` : "",
      artifact.errorCode ? `error_code: ${artifact.errorCode}` : "",
      artifact.framework ? `framework: ${artifact.framework}` : "",
      `message: ${normalizedMessage}`,
      `snippet:`,
      `SNIPPET_BEGIN`,
      truncatedSnippet,
      `SNIPPET_END`,
    ].filter((line) => line.length > 0);

    return lines.join("\n");
  });

  return formattedArtifacts.join("\n\n");
};

/**
 * Formats build metadata for the final analyzer prompt.
 * Handles edge cases where metadata fields may be empty/undefined.
 *
 * @param metadata - Build metadata
 * @returns Formatted metadata section
 */
export const formatBuildMetadata = (metadata: BuildMetadata): string => {
  const SHORT_SHA_LENGTH = 7;
  const shortSha = metadata.commitSha?.slice(0, SHORT_SHA_LENGTH) ?? "unknown";

  const lines = [
    `BUILD CONTEXT`,
    `repository: ${metadata.repo ?? "unknown"}`,
    `branch: ${metadata.branch ?? "unknown"}`,
    `commit: ${shortSha}`,
    `ci_platform: ${metadata.ciPlatform ?? "unknown"}`,
    `exit_code: ${metadata.exitCode ?? "unknown"}`,
    metadata.workflowName ? `workflow: ${metadata.workflowName}` : "",
    metadata.jobName ? `job: ${metadata.jobName}` : "",
    metadata.durationSeconds === undefined || metadata.durationSeconds === null
      ? ""
      : `duration_seconds: ${metadata.durationSeconds}`,
    metadata.triggeredBy ? `triggered_by: ${metadata.triggeredBy}` : "",
    metadata.runUrl ? `run_url: ${metadata.runUrl}` : "",
  ].filter((line) => line.length > 0);

  return lines.join("\n");
};
