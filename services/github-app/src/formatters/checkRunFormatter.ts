/**
 * Check run formatting utilities.
 *
 * Formats enriched context into markdown for CI failure analysis.
 */

import { formatDependencyChanges } from "@kenchi/shared";
import type { CheckRunWebhook } from "../types/githubTypes.js";
import type { EnrichedContext } from "../services/context/index.js";

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
  if (!description) return [];
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
    ...(pr.labels.length > 0 ? [`**Labels:** ${pr.labels.map((l) => `\`${l}\``).join(", ")}`] : []),
    ...(pr.reviewers.length > 0
      ? [`**Reviewers:** ${pr.reviewers.map((r) => `@${r}`).join(", ")}`]
      : []),
    ...formatDescription(pr.description),
  ];

  return lines.join("\n");
};

/**
 * Format check output section.
 */
const formatCheckOutputSection = (checkRun: CheckRunWebhook["check_run"]): string | null => {
  const checkOutput = [
    checkRun.output.title || "",
    checkRun.output.summary || "",
    checkRun.output.text || "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return checkOutput ? `## CI Check Output\n${checkOutput}` : null;
};

/**
 * Format annotations section.
 */
const formatAnnotationsSection = (context: EnrichedContext): string | null => {
  if (context.annotations.length === 0) {
    return null;
  }

  const annotationsSection = context.annotations
    .map((ann) => {
      const levelEmoji = ann.level === "failure" ? "❌" : ann.level === "warning" ? "⚠️" : "ℹ️";
      const title = ann.title ? `**${ann.title}**\n` : "";
      return `${levelEmoji} ${title}📍 \`${ann.path}:${ann.startLine}\`\n${ann.message}`;
    })
    .join("\n\n");

  return `## CI Annotations (Errors & Warnings)\n${annotationsSection}`;
};

/**
 * Format test failures section.
 */
const formatTestFailuresSection = (context: EnrichedContext): string | null => {
  if (context.testFailures.length === 0) {
    return null;
  }

  const testSection = context.testFailures
    .map((test) => {
      const fileInfo = test.file ? ` (${test.file})` : "";
      return `### ❌ ${test.testName}${fileInfo}\n\`\`\`\n${test.error}\n\`\`\``;
    })
    .join("\n\n");

  return `## Failed Tests\n${testSection}`;
};

/**
 * Format dependency changes section.
 */
const formatDependencyChangesSection = (context: EnrichedContext): string | null => {
  if (context.dependencyChanges.length === 0) {
    return null;
  }

  const depsSection = formatDependencyChanges(context.dependencyChanges);
  return `## Dependency Changes\n${depsSection}`;
};

/**
 * Format build config changes section.
 */
const formatBuildConfigSection = (context: EnrichedContext): string | null => {
  if (context.buildConfigChanges.length === 0) {
    return null;
  }

  const configSection = context.buildConfigChanges
    .map((config) => `### ${config.file}\n\`\`\`diff\n${config.diff}\n\`\`\``)
    .join("\n\n");

  return `## Build Config Changes\n${configSection}`;
};

/**
 * Format workflow logs section.
 */
const formatLogsSection = (context: EnrichedContext): string | null => {
  if (!context.workflowLogs) {
    return null;
  }
  return `## Workflow Logs\n\`\`\`\n${context.workflowLogs}\n\`\`\``;
};

/**
 * Format commit info section.
 */
const formatCommitSection = (context: EnrichedContext): string | null => {
  if (!context.commitInfo) {
    return null;
  }

  return (
    `## Commit Info\n` +
    `**SHA:** ${context.commitInfo.sha}\n` +
    `**Author:** ${context.commitInfo.author}\n` +
    `**Committer:** ${context.commitInfo.committer}\n` +
    `**Timestamp:** ${context.commitInfo.timestamp}\n` +
    `**Message:** ${context.commitInfo.message}\n` +
    `**Changed files:**\n${context.commitInfo.changedFiles.map((f) => `  - ${f}`).join("\n")}`
  );
};

/**
 * Format PR diff section.
 */
const formatDiffSection = (context: EnrichedContext): string | null => {
  if (!context.prDiff) {
    return null;
  }
  return `## PR Diff\n\`\`\`diff\n${context.prDiff}\n\`\`\``;
};

/**
 * Format source files section.
 */
const formatSourceFilesSection = (context: EnrichedContext): string | null => {
  if (context.sourceFiles.length === 0) {
    return null;
  }

  const filesSection = context.sourceFiles
    .map((file) => {
      const lineInfo =
        file.startLine && file.endLine ? ` (lines ${file.startLine}-${file.endLine})` : "";
      return `### ${file.path}${lineInfo}\n\`\`\`\n${file.content}\n\`\`\``;
    })
    .join("\n\n");

  return `## Relevant Source Files\n${filesSection}`;
};

/**
 * Format PR comments section.
 */
const formatCommentsSection = (context: EnrichedContext): string | null => {
  if (!context.prMetadata?.comments || context.prMetadata.comments.length === 0) {
    return null;
  }

  const commentsSection = context.prMetadata.comments
    .map((c) => `**@${c.author}** (${c.createdAt}):\n> ${c.body.replace(/\n/g, "\n> ")}`)
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
