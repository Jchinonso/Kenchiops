/**
 * Slack Analysis Block Builders
 *
 * Builds blocks for displaying analysis results in Slack messages:
 * - Root cause analysis
 * - Dependency changes
 * - Build config changes
 * - Related knowledge documents
 */

import {
  UI_EMOJI,
  UI_CONSTANTS,
  DEPENDENCY_EMOJI_MAP,
  FORMATTER_DISPLAY_LIMITS,
  formatWithEvidenceId,
  summarizeRootCauses,
  isTestFile,
  type LLMDetectedDependencyChange,
  type LLMDetectedBuildConfigChange,
  type RelatedKnowledgeDoc,
  type AnalyzedFailure,
  type RootCauseSummaryEntry,
} from "@kenchi/shared";
import { DISPLAY_LIMITS } from "./formatterUtils.js";
import type { SlackTextBlock } from "./slackBlockTypes.js";

// ==================== Helper Functions ====================

/**
 * Truncates a display string to max length with ellipsis.
 */
const truncateDisplay = (
  text: string,
  maxLength: number = FORMATTER_DISPLAY_LIMITS.SLACK_MAX_LINE_CHARS
): string => (text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`);

/**
 * Normalizes a root cause string for consistent display and deduplication.
 * - Trims whitespace
 * - Collapses multiple spaces/newlines
 * - Removes leading/trailing punctuation
 */
const normalizeRootCause = (cause: string): string =>
  cause
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.,;:\s]+|[.,;:\s]+$/g, "");

/**
 * Get change type emoji using UI_EMOJI constants
 */
const getChangeTypeEmoji = (changeType: string): string => {
  const changeTypeEmojiMap: Record<string, string> = {
    added: UI_EMOJI.depAdded,
    deleted: UI_EMOJI.depRemoved,
    modified: UI_EMOJI.commit,
  };
  return changeTypeEmojiMap[changeType] ?? UI_EMOJI.commit;
};

/**
 * Get emoji for knowledge document type
 */
const getKnowledgeTypeEmoji = (docType: string): string => {
  const typeEmojiMap: Record<string, string> = {
    runbook: UI_EMOJI.book,
    past_incident: UI_EMOJI.history,
    documentation: UI_EMOJI.book,
    best_practice: UI_EMOJI.success,
    playbook: UI_EMOJI.tools,
    postmortem: UI_EMOJI.history,
    troubleshooting: UI_EMOJI.search,
    sop: UI_EMOJI.book,
  };
  return typeEmojiMap[docType] ?? UI_EMOJI.book;
};

// ==================== Block Builders ====================

/**
 * Build root cause analysis block.
 * Normalizes causes, limits to top 3, and provides fallback message.
 */
export const buildRootCauseBlock = (
  causes: readonly string[],
  hasTestFailures: boolean = false,
  hasAnnotations: boolean = false
): SlackTextBlock => {
  // If no causes identified, provide context-appropriate fallback message
  if (causes.length === 0) {
    const fallbackMessage = hasTestFailures
      ? "Test failures detected. See details below."
      : hasAnnotations
        ? "CI check failed. See error locations below."
        : "CI check failed. Unable to determine specific root cause from available logs.";

    return {
      type: "section",
      text: { type: "mrkdwn", text: `*${UI_EMOJI.search} Root Cause:*\n${fallbackMessage}` },
    };
  }

  // Normalize and deduplicate causes
  const normalizedCauses = causes
    .map((cause) => normalizeRootCause(cause))
    .filter((cause) => cause.length > 0);

  // Deduplicate by normalized lowercase (keeps first occurrence)
  const uniqueCauses = Array.from(
    normalizedCauses
      .reduce((seen, cause) => {
        const key = cause.toLowerCase();
        return seen.has(key) ? seen : seen.set(key, cause);
      }, new Map<string, string>())
      .values()
  );

  // Limit to top causes and truncate each line
  const displayCauses = uniqueCauses.slice(0, FORMATTER_DISPLAY_LIMITS.MAX_ROOT_CAUSES);
  const overflowCount = uniqueCauses.length - displayCauses.length;

  const causeText =
    displayCauses.length === 1
      ? truncateDisplay(displayCauses[0], FORMATTER_DISPLAY_LIMITS.MAX_CAUSE_LINE_CHARS)
      : displayCauses
          .map(
            (cause, causeIndex) =>
              `${causeIndex + 1}. ${truncateDisplay(cause, FORMATTER_DISPLAY_LIMITS.MAX_CAUSE_LINE_CHARS)}`
          )
          .join("\n");

  const moreText = overflowCount > 0 ? `\n_...and ${overflowCount} more potential causes_` : "";

  return {
    type: "section",
    text: { type: "mrkdwn", text: `*${UI_EMOJI.search} Root Cause:*\n${causeText}${moreText}` },
  };
};

/**
 * Formats a single cluster for display.
 * Shows service name, unique file count, and top cause with evidence ID.
 */
const formatClusterEntry = (entry: RootCauseSummaryEntry): string => {
  const countLabel = entry.fileCount === 1 ? "1 file" : `${entry.fileCount} files`;
  const infraLabel = entry.isInfra ? ` ${UI_EMOJI.warning}` : "";
  const locationSuffix = entry.location ? ` (${entry.location})` : "";
  const evidenceTag = entry.evidenceIds[0] ?? "";
  const causeLineLimit = FORMATTER_DISPLAY_LIMITS.MAX_CAUSE_LINE_CHARS;
  const hasTestName = Boolean(entry.primaryTestName) && !isTestFile(entry.primaryTestName ?? "");
  const causeDisplay = entry.cause
    ? formatWithEvidenceId(
        truncateDisplay(`${entry.cause}${locationSuffix}`, causeLineLimit),
        evidenceTag
      )
    : hasTestName
      ? formatWithEvidenceId(
          truncateDisplay(
            `Test failure in ${entry.primaryTestName}${locationSuffix}`,
            causeLineLimit
          ),
          evidenceTag
        )
      : entry.location
        ? formatWithEvidenceId(
            truncateDisplay(`Failures in ${entry.location}`, causeLineLimit),
            evidenceTag
          )
        : "See details below";

  return `*${entry.service}* (${countLabel})${infraLabel}\n   ${causeDisplay}`;
};

/**
 * Build clustered root cause analysis block.
 * Groups causes by service/package for organized display.
 * Shows top 3 clusters with evidence IDs.
 *
 * @param failures - Array of analyzed failures to cluster
 * @returns Slack text block with clustered root causes
 */
export const buildClusteredRootCauseBlock = (
  failures: readonly AnalyzedFailure[]
): SlackTextBlock => {
  // If no failures, provide fallback
  if (failures.length === 0) {
    return {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${UI_EMOJI.search} Root Cause:*\nCI check failed. Unable to determine specific root cause.`,
      },
    };
  }

  const summary = summarizeRootCauses(failures, {
    maxEntries: FORMATTER_DISPLAY_LIMITS.MAX_ROOT_CAUSES,
  });

  if (summary.totalClusters === 0) {
    return {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${UI_EMOJI.search} Root Cause:*\nCI check failed. Unable to determine specific root cause.`,
      },
    };
  }

  if (summary.entries.length === 0) {
    const lowSignalText =
      summary.lowSignalCount > 0
        ? `\n_${summary.lowSignalCount} service${
            summary.lowSignalCount === 1 ? "" : "s"
          } with assertion-only failures_`
        : "";
    return {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${UI_EMOJI.search} Root Cause:*\nNo high-signal root cause detected. See affected files below.${lowSignalText}`,
      },
    };
  }

  // Check for infra issues to show warning
  const infraWarning = summary.hasInfra
    ? `\n\n${UI_EMOJI.warning} _Infrastructure issues detected (timeouts/resource limits)_`
    : "";

  // Format each cluster
  const clusterText = summary.entries.map((entry) => formatClusterEntry(entry)).join("\n\n");

  const lowSignalText =
    summary.lowSignalCount > 0
      ? `\n\n_${summary.lowSignalCount} service${
          summary.lowSignalCount === 1 ? "" : "s"
        } with assertion-only failures_`
      : "";
  const moreText =
    summary.hiddenCount > 0 ? `\n\n_...and ${summary.hiddenCount} more services affected_` : "";

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*${UI_EMOJI.search} Root Cause:*\n\n${clusterText}${infraWarning}${lowSignalText}${moreText}`,
    },
  };
};

/**
 * Build dependency changes block
 */
export const buildDependencyChangesBlock = (
  deps: readonly LLMDetectedDependencyChange[]
): SlackTextBlock | null => {
  if (deps.length === 0) {
    return null;
  }

  const displayCount = DISPLAY_LIMITS.slackAnnotationsPerCheck;
  const lines = deps
    .slice(0, displayCount)
    .map((dep) => {
      const emoji = DEPENDENCY_EMOJI_MAP[dep.type] ?? UI_EMOJI.package;
      const version =
        dep.oldVersion && dep.newVersion
          ? ` (${dep.oldVersion} -> ${dep.newVersion})`
          : dep.newVersion
            ? ` (${dep.newVersion})`
            : "";
      const ecosystem = dep.ecosystem ? ` [${dep.ecosystem}]` : "";
      return `   ${UI_EMOJI.list} ${emoji} \`${dep.name}\`${version}${ecosystem}`;
    })
    .join("\n");

  const moreText =
    deps.length > displayCount ? `\n   _...and ${deps.length - displayCount} more_` : "";

  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `${UI_EMOJI.depUpdated} *Dependency Changes (${deps.length}):*\n${lines}${moreText}`,
      },
    ],
  };
};

/**
 * Build build config changes block
 */
export const buildConfigChangesBlock = (
  configs: readonly LLMDetectedBuildConfigChange[]
): SlackTextBlock | null => {
  if (configs.length === 0) {
    return null;
  }

  const displayCount = DISPLAY_LIMITS.slackAnnotationsPerCheck;
  const lines = configs
    .slice(0, displayCount)
    .map((configChange) => {
      const emoji = getChangeTypeEmoji(configChange.changeType);
      return `   ${UI_EMOJI.list} ${emoji} \`${configChange.file}\` — ${configChange.summary}`;
    })
    .join("\n");

  const moreText =
    configs.length > displayCount ? `\n   _...and ${configs.length - displayCount} more_` : "";

  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `${UI_EMOJI.workflow} *Build Config Changes (${configs.length}):*\n${lines}${moreText}`,
      },
    ],
  };
};

/**
 * Build related knowledge documents block
 */
export const buildRelatedKnowledgeBlock = (
  docs: readonly RelatedKnowledgeDoc[]
): SlackTextBlock | null => {
  if (docs.length === 0) {
    return null;
  }

  const displayCount = DISPLAY_LIMITS.slackAnnotationsPerCheck;
  const lines = docs
    .slice(0, displayCount)
    .map((doc) => {
      const emoji = getKnowledgeTypeEmoji(doc.type);
      const similarity = Math.round(doc.similarity * UI_CONSTANTS.PERCENTAGE_MULTIPLIER);
      const link = doc.url ? `<${doc.url}|${doc.title}>` : doc.title;
      return `   ${UI_EMOJI.list} ${emoji} ${link} _(${similarity}% match)_`;
    })
    .join("\n");

  const moreText =
    docs.length > displayCount ? `\n   _...and ${docs.length - displayCount} more_` : "";

  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `${UI_EMOJI.book} *Related Knowledge (${docs.length}):*\n${lines}${moreText}`,
      },
    ],
  };
};
