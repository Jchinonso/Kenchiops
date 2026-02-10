/**
 * Slack Payload Formatter
 *
 * Builds Slack Block Kit payloads from aggregated CI failures.
 */

import {
  SHORT_COMMIT_SHA_LENGTH,
  GITHUB_COMMENT_DISPLAY,
  UI_EMOJI,
  type AggregatedFailures,
  type PRContext,
} from "@kenchi/shared";
import type { SlackBlock, SlackBlockElement, SlackPayload } from "./slackPayloadTypes.js";

export type { SlackBlock, SlackBlockElement, SlackPayload } from "./slackPayloadTypes.js";

// ==================== Display Limits ====================

const SLACK_DISPLAY_LIMITS = {
  /** Maximum changed files to show in PR context */
  MAX_CHANGED_FILES: 10,
} as const;

// ==================== Block Builders ====================

/**
 * Build header block for Slack message.
 */
const buildHeaderBlock = (repository: string): SlackBlock => ({
  type: "header",
  text: { type: "plain_text", text: `${UI_EMOJI.failure} CI Failure: ${repository}` },
});

/**
 * Build commit info section block.
 */
const buildCommitInfoBlock = (shortSha: string, failureCount: number): SlackBlock => ({
  type: "section",
  fields: [
    { type: "mrkdwn", text: `*${UI_EMOJI.info} Commit:* \`${shortSha}\`` },
    { type: "mrkdwn", text: `*${UI_EMOJI.warning} Failed Checks:* ${failureCount}` },
  ],
});

/**
 * Build PR context block with metadata and changed files.
 * Provides developers with PR context to correlate failures with code changes.
 */
const buildPRContextBlock = (prContext: PRContext): SlackBlock => {
  const titleLine = `${UI_EMOJI.list} *PR #${prContext.number}:* ${prContext.title}`;
  const metaLine = `${UI_EMOJI.user} ${prContext.author}  |  ${UI_EMOJI.branch} \`${prContext.branch}\` → \`${prContext.baseBranch}\``;

  const changedFiles = prContext.changedFiles ?? [];
  const filesLine =
    changedFiles.length > 0
      ? `${UI_EMOJI.document} *Changed files (${changedFiles.length}):* ${changedFiles
          .slice(0, SLACK_DISPLAY_LIMITS.MAX_CHANGED_FILES)
          .map((file) => `\`${file}\``)
          .join(
            ", "
          )}${changedFiles.length > SLACK_DISPLAY_LIMITS.MAX_CHANGED_FILES ? ` and ${changedFiles.length - SLACK_DISPLAY_LIMITS.MAX_CHANGED_FILES} more` : ""}`
      : null;

  const text = [titleLine, metaLine, filesLine]
    .filter((line): line is string => line !== null)
    .join("\n");

  return {
    type: "section",
    text: { type: "mrkdwn", text },
  };
};

/**
 * Build failure section block with recommended actions.
 */
const buildFailureBlock = (failure: AggregatedFailures["failures"][number]): SlackBlock => {
  const cause = failure.identifiedCause ?? failure.analysis ?? "Unknown error";

  const actionsText =
    failure.recommendedActions && failure.recommendedActions.length > 0
      ? `\n\n*${UI_EMOJI.tools} Actions:*\n${failure.recommendedActions
          .slice(0, GITHUB_COMMENT_DISPLAY.MAX_ACTIONS)
          .map((action) => `  \u2022 ${action.description}`)
          .join("\n")}`
      : "";

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*${UI_EMOJI.failure} ${failure.checkName}*\n>${cause}${actionsText}`,
    },
  };
};

/**
 * Build action buttons block for PR and commit links.
 */
const buildActionButtonsBlock = (
  repository: string,
  commitSha: string,
  prNumber?: number
): SlackBlock => {
  const prButton: readonly SlackBlockElement[] = prNumber
    ? [
        {
          type: "button" as const,
          text: { type: "plain_text" as const, text: "View PR" },
          url: `https://github.com/${repository}/pull/${prNumber}`,
        },
      ]
    : [];

  const commitButton: SlackBlockElement = {
    type: "button",
    text: { type: "plain_text", text: "View Commit" },
    url: `https://github.com/${repository}/commit/${commitSha}`,
  };

  return { type: "actions", elements: [...prButton, commitButton] };
};

/**
 * Build feedback section block.
 */
const buildFeedbackSectionBlock = (): SlackBlock => ({
  type: "section",
  text: { type: "mrkdwn", text: "*Was this helpful?*" },
});

/**
 * Build feedback buttons block.
 */
const buildFeedbackButtonsBlock = (analysisId: string): SlackBlock => ({
  type: "actions",
  elements: [
    {
      type: "button",
      text: { type: "plain_text", text: `${UI_EMOJI.thumbsUp} Yes` },
      action_id: "feedback_helpful",
      value: analysisId,
    },
    {
      type: "button",
      text: { type: "plain_text", text: `${UI_EMOJI.thumbsDown} No` },
      action_id: "feedback_not_helpful",
      value: analysisId,
    },
  ],
});

// ==================== Main Payload Builder ====================

/**
 * Build consolidated Slack payload from aggregated failures.
 */
export const buildConsolidatedSlackPayload = (aggregation: AggregatedFailures): SlackPayload => {
  const shortSha = aggregation.commitSha.substring(0, SHORT_COMMIT_SHA_LENGTH);
  const repository = aggregation.repository.fullName;
  const analysisId = `${repository}:${aggregation.commitSha}`;
  const prNumber = aggregation.pullRequestNumbers[0];

  const failureBlocks = aggregation.failures.map(buildFailureBlock);

  const prContextBlock: readonly SlackBlock[] = aggregation.prContext
    ? [buildPRContextBlock(aggregation.prContext)]
    : [];

  const blocks: readonly SlackBlock[] = [
    buildHeaderBlock(repository),
    buildCommitInfoBlock(shortSha, aggregation.failures.length),
    ...prContextBlock,
    { type: "divider" },
    ...failureBlocks,
    { type: "divider" },
    buildActionButtonsBlock(repository, aggregation.commitSha, prNumber),
    buildFeedbackSectionBlock(),
    buildFeedbackButtonsBlock(analysisId),
  ];

  const failureCause = aggregation.failures[0]?.identifiedCause ?? "Unknown error";

  return {
    text: `CI Failure: ${repository} - ${failureCause}`,
    blocks,
  };
};
