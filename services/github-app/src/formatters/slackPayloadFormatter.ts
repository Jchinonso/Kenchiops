/**
 * Slack Payload Formatter
 *
 * Formats aggregated CI failures into Slack Block Kit payloads.
 * Creates visually rich messages with failure details, annotations,
 * and recommended actions.
 */

import type { AggregatedFailures, AnalyzedFailure } from "../services/aggregation/types.js";
import {
  DISPLAY_LIMITS,
  getPriorityEmoji,
  calculateAverageConfidence,
  mergeRecommendedActions,
  getConfidenceEmoji,
} from "./formatterUtils.js";

// ==================== Types ====================

/**
 * Slack Block Kit block types
 */
interface SlackTextBlock {
  readonly type: "section" | "header" | "divider" | "context";
  readonly text?: {
    readonly type: "mrkdwn" | "plain_text";
    readonly text: string;
    readonly emoji?: boolean;
  };
  readonly fields?: ReadonlyArray<{
    readonly type: "mrkdwn" | "plain_text";
    readonly text: string;
  }>;
  readonly elements?: ReadonlyArray<{
    readonly type: "mrkdwn" | "plain_text";
    readonly text: string;
  }>;
}

// ==================== Helper Functions ====================

/**
 * Format a single failure into Slack blocks
 */
const formatFailureBlocks = (failure: AnalyzedFailure): SlackTextBlock[] => {
  const rootCauseBlock: SlackTextBlock = {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*\`${failure.checkName}\`*\n${failure.identifiedCause ?? failure.analysis ?? "Analysis unavailable"}`,
    },
  };

  if (failure.annotations.length === 0) {
    return [rootCauseBlock];
  }

  const annotationLines = failure.annotations
    .slice(0, DISPLAY_LIMITS.slackAnnotationsPerCheck)
    .map((a) => `   • \`${a.path}:${a.line}\` — ${a.message}`)
    .join("\n");

  const moreText =
    failure.annotations.length > DISPLAY_LIMITS.slackAnnotationsPerCheck
      ? `\n   _...and ${failure.annotations.length - DISPLAY_LIMITS.slackAnnotationsPerCheck} more_`
      : "";

  const annotationBlock: SlackTextBlock = {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `📍 *Affected Files:*\n${annotationLines}${moreText}`,
      },
    ],
  };

  return [rootCauseBlock, annotationBlock];
};

// ==================== Public API ====================

/**
 * Build consolidated Slack payload from aggregated failures.
 * Creates a Block Kit message with all failure details.
 */
export const buildConsolidatedSlackPayload = (
  aggregation: AggregatedFailures
): Record<string, unknown> => {
  const { failures, commitSha, repository, prContext } = aggregation;
  const avgConfidence = calculateAverageConfidence(failures);
  const mergedActions = mergeRecommendedActions(failures);
  const confidencePercent = Math.round(avgConfidence * 100);

  // Build GitHub links
  const repoUrl = `https://github.com/${repository.fullName}`;
  const commitUrl = `${repoUrl}/commit/${commitSha}`;
  const prUrl = prContext ? `${repoUrl}/pull/${prContext.number}` : null;

  // Build header blocks
  const headerBlocks: SlackTextBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "🚨 CI Build Failed",
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*📦 Repository*\n<${repoUrl}|${repository.fullName}>` },
        {
          type: "mrkdwn",
          text: `*🔀 Branch*\n\`${prContext?.branch ?? "unknown"}\` → \`${prContext?.baseBranch ?? "main"}\``,
        },
        { type: "mrkdwn", text: `*📝 Commit*\n<${commitUrl}|\`${commitSha.substring(0, 7)}\`>` },
        {
          type: "mrkdwn",
          text: `*📊 Confidence*\n${getConfidenceEmoji(confidencePercent)} ${confidencePercent}%`,
        },
      ],
    },
  ];

  // PR link block (conditional)
  const prLinkBlocks: SlackTextBlock[] =
    prContext && prUrl
      ? [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*🔗 Pull Request:* <${prUrl}|#${prContext.number} - ${prContext.title}>`,
            },
          },
        ]
      : [];

  // Failed checks header
  const failedChecksHeader: SlackTextBlock[] = [
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*❌ Failed Checks (${failures.length})*` },
    },
  ];

  // Individual failure blocks
  const failureBlocks = failures
    .slice(0, DISPLAY_LIMITS.slackMaxChecks)
    .flatMap(formatFailureBlocks);

  // More failures indicator
  const moreFailuresBlock: SlackTextBlock[] =
    failures.length > DISPLAY_LIMITS.slackMaxChecks
      ? [
          {
            type: "context",
            elements: [
              { type: "mrkdwn", text: `_...and ${failures.length - DISPLAY_LIMITS.slackMaxChecks} more failed checks_` },
            ],
          },
        ]
      : [];

  // Recommended actions blocks
  const actionsBlocks: SlackTextBlock[] =
    mergedActions.length > 0
      ? [
          { type: "divider" },
          { type: "section", text: { type: "mrkdwn", text: "*🛠️ Recommended Actions*" } },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: mergedActions
                .slice(0, DISPLAY_LIMITS.slackMaxChecks)
                .map((a, i) => `${i + 1}. ${getPriorityEmoji(a.priority)} ${a.description}`)
                .join("\n"),
            },
          },
        ]
      : [];

  // Footer blocks
  const footerBlocks: SlackTextBlock[] = [
    { type: "divider" },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: "🤖 _Generated by KenchiOps DevOps Assistant_" }],
    },
  ];

  // Combine all blocks
  const blocks: SlackTextBlock[] = [
    ...headerBlocks,
    ...prLinkBlocks,
    ...failedChecksHeader,
    ...failureBlocks,
    ...moreFailuresBlock,
    ...actionsBlocks,
    ...footerBlocks,
  ];

  return {
    blocks,
    text: `🚨 CI Failure: ${failures.length} check(s) failed in ${repository.fullName}`,
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
