/**
 * Check run formatting utilities.
 *
 * Formats enriched context into markdown for CI failure analysis.
 * All evidence items get stable, citeable IDs for LLM traceability.
 *
 * ID Format:
 * - Check output: [check#title], [check#summary], [check#text]
 * - Annotations: [anno#N]
 * - Test failures: [test#N]
 * - Dependency changes: [dep#N]
 * - Build config: [cfg#path]
 * - Workflow logs: [wflog#N] (chunked)
 * - Commit: [commit#sha]
 * - Diff: [diff#N] (chunked)
 * - Source files: [src#path:lines]
 * - PR comments: [comment#N]
 */

import { UI_EMOJI, ANNOTATION_LEVEL_EMOJI_MAP, sanitizeIdPart } from "@kenchi/shared";
import type { CheckRunWebhook } from "../types/githubTypes.js";
import type { EnrichedContext } from "../services/context/index.js";

// ==================== Constants ====================

/** Maximum characters for workflow logs before chunking */
const MAX_LOG_CHUNK_CHARS = 3000;

/** Maximum characters for diff before chunking */
const MAX_DIFF_CHUNK_CHARS = 2000;

/** Maximum characters for source file content */
const MAX_SOURCE_FILE_CHARS = 1500;

/** Maximum characters for test error output */
const MAX_TEST_ERROR_CHARS = 1000;

// ==================== Chunking Utilities ====================

/**
 * Accumulator state for chunk building.
 */
interface ChunkAccumulator {
  readonly chunks: readonly string[];
  readonly currentChunk: string;
  readonly chunkIndex: number;
}

/**
 * Chunks text into smaller pieces with IDs.
 * Uses reduce for functional accumulation.
 */
const chunkText = (text: string, maxChars: number, idPrefix: string): string[] => {
  if (text.length <= maxChars) {
    return [`[${idPrefix}#1] ${text}`];
  }

  const lines = text.split("\n");

  const finalState = lines.reduce<ChunkAccumulator>(
    (acc, line) => {
      const wouldExceed = acc.currentChunk.length + line.length + 1 > maxChars;
      const hasContent = acc.currentChunk.length > 0;

      if (wouldExceed && hasContent) {
        // Finalize current chunk and start new one
        return {
          chunks: [...acc.chunks, `[${idPrefix}#${acc.chunkIndex}]\n${acc.currentChunk}`],
          currentChunk: line,
          chunkIndex: acc.chunkIndex + 1,
        };
      }

      // Append to current chunk
      return {
        ...acc,
        currentChunk: acc.currentChunk ? `${acc.currentChunk}\n${line}` : line,
      };
    },
    { chunks: [], currentChunk: "", chunkIndex: 1 }
  );

  // Add final chunk if present
  return finalState.currentChunk
    ? [...finalState.chunks, `[${idPrefix}#${finalState.chunkIndex}]\n${finalState.currentChunk}`]
    : [...finalState.chunks];
};

/**
 * Truncates text with marker if too long.
 */
const truncateWithMarker = (text: string, maxChars: number): string => {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n...<TRUNCATED>...`;
};

/**
 * Format duration in human-readable format.
 *
 * @param ms - Duration in milliseconds
 * @returns Human-readable duration string (e.g., "2m 30s")
 */
export const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
};

/**
 * Format repository metadata lines.
 */
const formatRepoLines = (repo: NonNullable<EnrichedContext["repositoryMetadata"]>): string[] => [
  `**Repository:** ${repo.fullName} (${repo.isPrivate ? "private" : "public"})`,
  `**Default Branch:** ${repo.defaultBranch}`,
  ...(repo.language ? [`**Language:** ${repo.language}`] : []),
];

/**
 * Format workflow timing lines.
 */
const formatTimingLines = (timing: NonNullable<EnrichedContext["workflowTiming"]>): string[] => [
  `**Workflow:** ${timing.workflowName}`,
  ...(timing.jobName ? [`**Failed Job:** ${timing.jobName}`] : []),
  ...(timing.durationMs ? [`**Duration:** ${formatDuration(timing.durationMs)}`] : []),
  `**Conclusion:** ${timing.conclusion || "unknown"}`,
];

/**
 * Format repository and workflow overview section.
 * Uses functional patterns - no let declarations.
 */
const formatOverviewSection = (context: EnrichedContext): string | null => {
  if (!context.repositoryMetadata && !context.workflowTiming) {
    return null;
  }

  const lines = [
    "## Repository & CI Overview",
    ...(context.repositoryMetadata ? formatRepoLines(context.repositoryMetadata) : []),
    ...(context.workflowTiming ? formatTimingLines(context.workflowTiming) : []),
  ];

  return lines.join("\n");
};

/**
 * Format PR description with truncation.
 */
const formatDescription = (
  description: string | null | undefined,
  maxLength: number = 500
): string[] => {
  if (!description) {
    return [];
  }
  const truncated = description.slice(0, maxLength);
  const suffix = description.length > maxLength ? "..." : "";
  return ["", `**Description:**`, `${truncated}${suffix}`];
};

/**
 * Format PR information section.
 * Uses functional patterns - no let declarations.
 */
const formatPRSection = (context: EnrichedContext): string | null => {
  if (!context.prMetadata) {
    return null;
  }

  const pr = context.prMetadata;
  const lines = [
    `## Pull Request #${pr.number}`,
    `**Title:** ${pr.title}`,
    `**Author:** @${pr.author}`,
    `**Branch:** ${pr.headBranch} → ${pr.baseBranch}`,
    `**Review Status:** ${pr.reviewStatus}${pr.isDraft ? " (Draft)" : ""}`,
    ...(pr.labels.length > 0
      ? [`**Labels:** ${pr.labels.map((label) => `\`${label}\``).join(", ")}`]
      : []),
    ...(pr.reviewers.length > 0
      ? [`**Reviewers:** ${pr.reviewers.map((reviewer) => `@${reviewer}`).join(", ")}`]
      : []),
    ...formatDescription(pr.description),
  ];

  return lines.join("\n");
};

/**
 * Format check output section with evidence IDs.
 */
const formatCheckOutputSection = (checkRun: CheckRunWebhook["check_run"]): string | null => {
  const parts: string[] = [];

  if (checkRun.output.title) {
    parts.push(`[check#title] ${checkRun.output.title}`);
  }
  if (checkRun.output.summary) {
    parts.push(`[check#summary] ${checkRun.output.summary}`);
  }
  if (checkRun.output.text) {
    const truncatedText = truncateWithMarker(checkRun.output.text, MAX_LOG_CHUNK_CHARS);
    parts.push(`[check#text]\n${truncatedText}`);
  }

  return parts.length > 0 ? `## CI Check Output\n${parts.join("\n\n")}` : null;
};

/**
 * Format annotations section with evidence IDs.
 */
const formatAnnotationsSection = (context: EnrichedContext): string | null => {
  if (context.annotations.length === 0) {
    return null;
  }

  const annotationsSection = context.annotations
    .map((annotation, index) => {
      const evidenceId = `[anno#${index + 1}]`;
      const levelEmoji = ANNOTATION_LEVEL_EMOJI_MAP[annotation.level] ?? UI_EMOJI.info;
      const title = annotation.title ? ` ${annotation.title}` : "";
      return `${evidenceId} ${levelEmoji}${title}\n  Path: ${annotation.path}:${annotation.startLine}\n  ${annotation.message}`;
    })
    .join("\n\n");

  return `## CI Annotations (Errors & Warnings)\n${annotationsSection}`;
};

/**
 * Format test failures section with evidence IDs.
 * Uses delimiters instead of code fences to avoid pattern copying.
 */
const formatTestFailuresSection = (context: EnrichedContext): string | null => {
  if (context.testFailures.length === 0) {
    return null;
  }

  const testSection = context.testFailures
    .map((testFailure, index) => {
      const evidenceId = `[test#${index + 1}]`;
      const fileInfo = testFailure.file ? `\n  File: ${testFailure.file}` : "";
      const truncatedError = truncateWithMarker(testFailure.error, MAX_TEST_ERROR_CHARS);
      return `${evidenceId} ${testFailure.testName}${fileInfo}\nTEST_ERROR_BEGIN\n${truncatedError}\nTEST_ERROR_END`;
    })
    .join("\n\n");

  return `## Failed Tests\n${testSection}`;
};

/**
 * Format dependency changes section with evidence IDs.
 */
const formatDependencyChangesSection = (context: EnrichedContext): string | null => {
  if (context.dependencyChanges.length === 0) {
    return null;
  }

  const depsSection = context.dependencyChanges
    .map((depChange, index) => {
      const evidenceId = `[dep#${index + 1}]`;
      const versionInfo = depChange.oldVersion
        ? `${depChange.oldVersion} → ${depChange.newVersion}`
        : (depChange.newVersion ?? "unknown");
      return `${evidenceId} ${depChange.type}: ${depChange.name} (${versionInfo})`;
    })
    .join("\n");

  return `## Dependency Changes\n${depsSection}`;
};

/**
 * Format build config changes section with evidence IDs.
 * Uses delimiters instead of code fences.
 */
const formatBuildConfigSection = (context: EnrichedContext): string | null => {
  if (context.buildConfigChanges.length === 0) {
    return null;
  }

  const configSection = context.buildConfigChanges
    .map((configChange) => {
      const sanitizedPath = sanitizeIdPart(configChange.file);
      const evidenceId = `[cfg#${sanitizedPath}]`;
      const truncatedDiff = truncateWithMarker(configChange.diff, MAX_DIFF_CHUNK_CHARS);
      return `${evidenceId} ${configChange.file}\nCONFIG_DIFF_BEGIN\n${truncatedDiff}\nCONFIG_DIFF_END`;
    })
    .join("\n\n");

  return `## Build Config Changes\n${configSection}`;
};

/**
 * Format workflow logs section with chunked evidence IDs.
 * Uses delimiters instead of code fences and chunks large logs.
 */
const formatLogsSection = (context: EnrichedContext): string | null => {
  if (!context.workflowLogs) {
    return null;
  }

  const chunks = chunkText(context.workflowLogs, MAX_LOG_CHUNK_CHARS, "wflog");
  const logsSection = chunks.join("\n\n");

  return `## Workflow Logs\nLOGS_BEGIN\n${logsSection}\nLOGS_END`;
};

/**
 * Format commit info section with evidence ID.
 */
const formatCommitSection = (context: EnrichedContext): string | null => {
  if (!context.commitInfo) {
    return null;
  }

  const commit = context.commitInfo;
  const shortSha = commit.sha.slice(0, 12);
  const evidenceId = `[commit#${sanitizeIdPart(shortSha)}]`;
  const lines = [
    `${evidenceId} SHA: ${commit.sha}`,
    `  Author: ${commit.author}`,
    `  Committer: ${commit.committer}`,
    `  Timestamp: ${commit.timestamp}`,
    `  Message: ${commit.message}`,
    `  Changed files:`,
    ...commit.changedFiles.map((filePath) => `    - ${filePath}`),
  ];

  return `## Commit Info\n${lines.join("\n")}`;
};

/**
 * Format PR diff section with chunked evidence IDs.
 * Uses delimiters instead of code fences.
 */
const formatDiffSection = (context: EnrichedContext): string | null => {
  if (!context.prDiff) {
    return null;
  }

  const chunks = chunkText(context.prDiff, MAX_DIFF_CHUNK_CHARS, "diff");
  const diffSection = chunks.join("\n\n");

  return `## PR Diff\nDIFF_BEGIN\n${diffSection}\nDIFF_END`;
};

/**
 * Format source files section with evidence IDs.
 * Uses delimiters instead of code fences.
 */
const formatSourceFilesSection = (context: EnrichedContext): string | null => {
  if (context.sourceFiles.length === 0) {
    return null;
  }

  const filesSection = context.sourceFiles
    .map((sourceFile) => {
      const sanitizedPath = sanitizeIdPart(sourceFile.path);
      const lineRange =
        sourceFile.startLine && sourceFile.endLine
          ? `${sourceFile.startLine}-${sourceFile.endLine}`
          : "all";
      const evidenceId = `[src#${sanitizedPath}:${lineRange}]`;
      const truncatedContent = truncateWithMarker(sourceFile.content, MAX_SOURCE_FILE_CHARS);
      return `${evidenceId} ${sourceFile.path}\nSOURCE_BEGIN\n${truncatedContent}\nSOURCE_END`;
    })
    .join("\n\n");

  return `## Relevant Source Files\n${filesSection}`;
};

/**
 * Format PR comments section with evidence IDs.
 */
const formatCommentsSection = (context: EnrichedContext): string | null => {
  if (!context.prMetadata?.comments || context.prMetadata.comments.length === 0) {
    return null;
  }

  const commentsSection = context.prMetadata.comments
    .map((comment, index) => {
      const evidenceId = `[comment#${index + 1}]`;
      return `${evidenceId} @${comment.author} (${comment.createdAt}):\n  ${comment.body.replace(/\n/g, "\n  ")}`;
    })
    .join("\n\n");

  return `## Recent PR Discussion\n${commentsSection}`;
};

/**
 * Build enriched log content with all available context.
 *
 * Combines all context sections into a structured markdown document
 * for AI analysis.
 *
 * @param webhook - The check run webhook payload
 * @param context - The enriched context data
 * @returns Formatted markdown content
 */
export const buildEnrichedLogContent = (
  webhook: CheckRunWebhook,
  context: EnrichedContext
): string => {
  const { check_run } = webhook;

  const sections = [
    formatOverviewSection(context),
    formatPRSection(context),
    formatCheckOutputSection(check_run),
    formatAnnotationsSection(context),
    formatTestFailuresSection(context),
    formatDependencyChangesSection(context),
    formatBuildConfigSection(context),
    formatLogsSection(context),
    formatCommitSection(context),
    formatDiffSection(context),
    formatSourceFilesSection(context),
    formatCommentsSection(context),
  ].filter((section): section is string => section !== null);

  return sections.join("\n\n---\n\n") || `CI check "${check_run.name}" failed`;
};
