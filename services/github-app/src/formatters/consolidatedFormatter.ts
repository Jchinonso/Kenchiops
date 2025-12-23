/**
 * Consolidated Formatter
 *
 * Formats aggregated CI failures into a single cohesive message
 * for both GitHub PR comments and Slack notifications.
 *
 * Produces clean, organized output that groups failures by check name
 * and provides a unified view of all issues in a commit.
 */

import type {
  AggregatedFailures,
  AnalyzedFailure,
  CodeAnnotation,
  RecommendedAction,
} from "../services/aggregation/types.js";

// ==================== Constants ====================

/**
 * Level icons for annotations
 */
const LEVEL_ICONS: Record<CodeAnnotation["level"], string> = {
  failure: "❌",
  warning: "⚠️",
  notice: "ℹ️",
} as const;

/**
 * Priority emoji lookup
 */
const PRIORITY_EMOJI: Record<string, string> = {
  immediate: "🔴",
  high: "🔴",
  medium: "🟡",
  low: "🟢",
} as const;

/**
 * Maximum items to display per section
 */
const DISPLAY_LIMITS = {
  annotationsPerCheck: 10,
  totalAnnotations: 30,
  recommendedActions: 8,
  checksToShow: 10,
} as const;

// ==================== Utility Functions ====================

/**
 * Get priority emoji from priority value
 */
const getPriorityEmoji = (priority: string | number): string => {
  if (typeof priority === "number") {
    return priority <= 1 ? "🔴" : priority <= 2 ? "🟡" : "🟢";
  }
  return PRIORITY_EMOJI[priority.toLowerCase()] ?? "⚪";
};

/**
 * Format a single annotation as markdown
 */
const formatAnnotation = (annotation: CodeAnnotation): string => {
  const icon = LEVEL_ICONS[annotation.level];
  const title = annotation.title ? `**${annotation.title}**: ` : "";
  return `  - ${icon} \`${annotation.path}:${annotation.line}\` - ${title}${annotation.message}`;
};

/**
 * Format a recommended action as markdown
 */
const formatAction = (action: RecommendedAction, index: number): string => {
  const emoji = getPriorityEmoji(action.priority);
  return `${index + 1}. ${emoji} ${action.description}`;
};

/**
 * Calculate average confidence from failures
 */
const calculateAverageConfidence = (failures: readonly AnalyzedFailure[]): number => {
  if (failures.length === 0) return 0;
  const sum = failures.reduce((acc, f) => acc + f.confidence, 0);
  return sum / failures.length;
};

/**
 * Deduplicate and merge recommended actions from all failures
 */
const mergeRecommendedActions = (failures: readonly AnalyzedFailure[]): RecommendedAction[] => {
  const actionMap = new Map<string, RecommendedAction>();

  failures
    .flatMap((f) => f.recommendedActions)
    .forEach((action) => {
      // Use description as key for deduplication
      const key = action.description.toLowerCase().trim();
      if (!actionMap.has(key)) {
        actionMap.set(key, action);
      }
    });

  // Sort by priority (immediate/high first)
  const priorityOrder: Record<string, number> = {
    immediate: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  return Array.from(actionMap.values())
    .sort((a, b) => {
      const aPriority =
        typeof a.priority === "string"
          ? (priorityOrder[a.priority.toLowerCase()] ?? 4)
          : a.priority;
      const bPriority =
        typeof b.priority === "string"
          ? (priorityOrder[b.priority.toLowerCase()] ?? 4)
          : b.priority;
      return (aPriority as number) - (bPriority as number);
    })
    .slice(0, DISPLAY_LIMITS.recommendedActions);
};

// ==================== PR Comment Formatter ====================

/**
 * Format a single failure section for PR comment
 */
const formatFailureSection = (failure: AnalyzedFailure, showAnnotations: boolean): string[] => {
  const lines: string[] = [
    `### ❌ ${failure.checkName}`,
    "",
    `**Root Cause:** ${failure.identifiedCause || failure.analysis || "Unable to determine"}`,
    `**Confidence:** ${Math.round(failure.confidence * 100)}%`,
    "",
  ];

  if (showAnnotations && failure.annotations.length > 0) {
    lines.push("**Affected Files:**");
    const displayAnnotations = failure.annotations.slice(0, DISPLAY_LIMITS.annotationsPerCheck);
    lines.push(...displayAnnotations.map(formatAnnotation));

    if (failure.annotations.length > DISPLAY_LIMITS.annotationsPerCheck) {
      lines.push(
        `  - ... and ${failure.annotations.length - DISPLAY_LIMITS.annotationsPerCheck} more locations`
      );
    }
    lines.push("");
  }

  return lines;
};

/**
 * Build consolidated PR comment body from aggregated failures
 */
export const buildConsolidatedPRComment = (aggregation: AggregatedFailures): string => {
  const { failures, commitSha, prContext } = aggregation;
  const avgConfidence = calculateAverageConfidence(failures);
  const mergedActions = mergeRecommendedActions(failures);

  // Header
  const lines: string[] = [
    "## 🤖 KenchiOps CI Failure Analysis",
    "",
    `**Commit:** \`${commitSha.substring(0, 7)}\``,
    `**Failed Checks:** ${failures.length}`,
    `**Overall Confidence:** ${Math.round(avgConfidence * 100)}%`,
  ];

  // PR context if available
  if (prContext) {
    lines.push(`**Branch:** \`${prContext.branch}\` → \`${prContext.baseBranch}\``);
  }

  lines.push("", "---", "");

  // Individual failure sections
  const failuresToShow = failures.slice(0, DISPLAY_LIMITS.checksToShow);
  const totalAnnotations = failures.reduce((sum, f) => sum + f.annotations.length, 0);
  const showAnnotations = totalAnnotations <= DISPLAY_LIMITS.totalAnnotations;

  failuresToShow.forEach((failure) => {
    lines.push(...formatFailureSection(failure, showAnnotations));
  });

  if (failures.length > DISPLAY_LIMITS.checksToShow) {
    lines.push(`*... and ${failures.length - DISPLAY_LIMITS.checksToShow} more failed checks*`, "");
  }

  // Consolidated recommended actions
  if (mergedActions.length > 0) {
    lines.push("---", "", "## 🛠️ Recommended Actions", "");
    lines.push(...mergedActions.map(formatAction));
    lines.push("");
  }

  // Footer
  lines.push("---", "*Generated by KenchiOps DevOps Assistant*");

  return lines.join("\n");
};

// ==================== Slack Payload Formatter ====================

/**
 * Slack Block Kit block types
 */
interface SlackTextBlock {
  type: "section" | "header" | "divider" | "context";
  text?: {
    type: "mrkdwn" | "plain_text";
    text: string;
    emoji?: boolean;
  };
  elements?: Array<{
    type: "mrkdwn" | "plain_text";
    text: string;
  }>;
}

/**
 * Format failure for Slack block
 */
const formatFailureForSlack = (failure: AnalyzedFailure): SlackTextBlock[] => {
  const blocks: SlackTextBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*❌ ${failure.checkName}*\n${failure.identifiedCause || failure.analysis || "Analysis unavailable"}`,
      },
    },
  ];

  // Add annotations if present (limited)
  if (failure.annotations.length > 0) {
    const annotationText = failure.annotations
      .slice(0, 5)
      .map((a) => `• \`${a.path}:${a.line}\` - ${a.message}`)
      .join("\n");

    const suffix =
      failure.annotations.length > 5 ? `\n_...and ${failure.annotations.length - 5} more_` : "";

    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: annotationText + suffix,
        },
      ],
    });
  }

  return blocks;
};

/**
 * Build consolidated Slack payload from aggregated failures
 */
export const buildConsolidatedSlackPayload = (
  aggregation: AggregatedFailures
): Record<string, unknown> => {
  const { failures, commitSha, repository, prContext } = aggregation;
  const avgConfidence = calculateAverageConfidence(failures);
  const mergedActions = mergeRecommendedActions(failures);

  const blocks: SlackTextBlock[] = [
    // Header
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "🚨 CI Failure Analysis",
        emoji: true,
      },
    },
    // Summary
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          `*Repository:* \`${repository.fullName}\``,
          `*Commit:* \`${commitSha.substring(0, 7)}\``,
          `*Failed Checks:* ${failures.length}`,
          `*Confidence:* ${Math.round(avgConfidence * 100)}%`,
          prContext ? `*Branch:* \`${prContext.branch}\` → \`${prContext.baseBranch}\`` : "",
          prContext ? `*PR:* #${prContext.number} - ${prContext.title}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    },
    { type: "divider" },
  ];

  // Individual failures (limited to 5 for Slack)
  const failuresToShow = failures.slice(0, 5);
  failuresToShow.forEach((failure) => {
    blocks.push(...formatFailureForSlack(failure));
  });

  if (failures.length > 5) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `_...and ${failures.length - 5} more failed checks_`,
        },
      ],
    });
  }

  // Recommended actions
  if (mergedActions.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          "*🛠️ Recommended Actions:*\n" +
          mergedActions
            .slice(0, 5)
            .map((a, i) => `${i + 1}. ${getPriorityEmoji(a.priority)} ${a.description}`)
            .join("\n"),
      },
    });
  }

  return {
    blocks,
    // Legacy fallback text
    text: `CI Failure: ${failures.length} check(s) failed in ${repository.fullName}`,
    // Additional metadata for the Slack handler
    metadata: {
      repository: repository.fullName,
      commitSha,
      failureCount: failures.length,
      checkNames: failures.map((f) => f.checkName),
      avgConfidence,
      isConsolidated: true,
    },
  };
};

// ==================== GitHub Check Annotations ====================

/**
 * GitHub check annotation format
 */
export interface GitHubCheckAnnotation {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: "failure" | "warning" | "notice";
  message: string;
  title: string;
}

/**
 * Build consolidated check annotations from all failures
 */
export const buildConsolidatedCheckAnnotations = (
  aggregation: AggregatedFailures
): GitHubCheckAnnotation[] => {
  const allAnnotations: GitHubCheckAnnotation[] = [];

  aggregation.failures.forEach((failure) => {
    failure.annotations.forEach((annotation) => {
      allAnnotations.push({
        path: annotation.path,
        start_line: annotation.line,
        end_line: annotation.line,
        annotation_level: annotation.level,
        message: `[${failure.checkName}] ${annotation.message}`,
        title: annotation.title ?? failure.checkName,
      });
    });
  });

  // Deduplicate by path:line and limit to 50
  const seen = new Set<string>();
  return allAnnotations
    .filter((ann) => {
      const key = `${ann.path}:${ann.start_line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 50);
};

/**
 * Build summary text for GitHub check run
 */
export const buildConsolidatedCheckSummary = (aggregation: AggregatedFailures): string => {
  const { failures } = aggregation;
  const avgConfidence = calculateAverageConfidence(failures);

  const checkList = failures
    .map((f) => `- **${f.checkName}**: ${f.identifiedCause || "Analysis in progress"}`)
    .join("\n");

  return [
    `## CI Failure Summary`,
    "",
    `**Failed Checks:** ${failures.length}`,
    `**Overall Confidence:** ${Math.round(avgConfidence * 100)}%`,
    "",
    "### Failed Checks",
    checkList,
  ].join("\n");
};
