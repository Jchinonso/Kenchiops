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
} from "@kenchi/shared";

/**
 * Slack block element for buttons.
 */
export interface SlackBlockElement {
  readonly type: "button";
  readonly text: { readonly type: "plain_text"; readonly text: string };
  readonly url?: string;
  readonly action_id?: string;
  readonly value?: string;
}

/**
 * Slack block structure for Block Kit.
 */
export interface SlackBlock {
  readonly type: "header" | "section" | "divider" | "actions";
  readonly text?: { readonly type: "mrkdwn" | "plain_text"; readonly text: string };
  readonly fields?: ReadonlyArray<{ readonly type: "mrkdwn"; readonly text: string }>;
  readonly elements?: readonly SlackBlockElement[];
}

/**
 * Slack payload structure.
 */
export interface SlackPayload {
  readonly text: string;
  readonly blocks: readonly SlackBlock[];
}

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
  const elements: SlackBlockElement[] = [];

  if (prNumber) {
    elements.push({
      type: "button",
      text: { type: "plain_text", text: "View PR" },
      url: `https://github.com/${repository}/pull/${prNumber}`,
    });
  }

  elements.push({
    type: "button",
    text: { type: "plain_text", text: "View Commit" },
    url: `https://github.com/${repository}/commit/${commitSha}`,
  });

  return { type: "actions", elements };
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

/**
 * Build consolidated Slack payload from aggregated failures.
 */
export const buildConsolidatedSlackPayload = (aggregation: AggregatedFailures): SlackPayload => {
  const shortSha = aggregation.commitSha.substring(0, SHORT_COMMIT_SHA_LENGTH);
  const repository = aggregation.repository.fullName;
  const analysisId = `${repository}:${aggregation.commitSha}`;
  const prNumber = aggregation.pullRequestNumbers[0];

  const failureBlocks = aggregation.failures.map(buildFailureBlock);

  const blocks: SlackBlock[] = [
    buildHeaderBlock(repository),
    buildCommitInfoBlock(shortSha, aggregation.failures.length),
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
