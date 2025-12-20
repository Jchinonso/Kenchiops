/**
 * CI Failure Formatting Utilities
 *
 * Formats CI failure analysis into Slack Block Kit blocks
 * and attachments for rich, readable notifications.
 */

import {
  PRIORITY_EMOJI,
  getConfidenceColor,
  collectCIErrors,
  GIT_DISPLAY,
} from "@kenchi/shared";
import type { SlackBlock, CIFailureAnalysis } from "../types/slackTypes.js";

/**
 * Slack attachment type compatible with Slack API.
 */
export interface MessageAttachment {
  color: string;
  fallback: string;
  blocks: SlackBlock[];
}

/**
 * Gets priority emoji for action priority.
 *
 * @param priority - Priority level (critical, high, medium, low)
 * @returns Emoji string for the priority level
 */
export const getPriorityEmoji = (priority: string): string => {
  const p = priority.toLowerCase() as keyof typeof PRIORITY_EMOJI;
  return PRIORITY_EMOJI[p] || PRIORITY_EMOJI.low;
};

/**
 * Creates header block for CI failure notification.
 */
const createHeaderBlock = (repository: string): SlackBlock => ({
  type: "section",
  text: {
    type: "mrkdwn",
    text: `:rotating_light: *CI Failed* in \`${repository}\``,
  },
});

/**
 * Creates main message block with root cause.
 */
const createMainMessageBlock = (analysis: CIFailureAnalysis): SlackBlock => ({
  type: "section",
  text: {
    type: "mrkdwn",
    text: analysis.identified_cause || analysis.analysis,
  },
});

/**
 * Creates errors section block if errors exist.
 */
const createErrorsBlock = (errors: readonly string[]): SlackBlock | null => {
  if (errors.length === 0) return null;

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*Errors:*\n${errors.map((e) => `• ${e}`).join("\n")}`,
    },
  };
};

/**
 * Creates fix recommendation block if actions exist.
 */
const createFixBlock = (analysis: CIFailureAnalysis): SlackBlock | null => {
  const topAction = analysis.recommended_actions?.[0];
  if (!topAction) return null;

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*Fix:* ${topAction.description}`,
    },
  };
};

/**
 * Creates footer context block.
 */
const createFooterBlock = (analysis: CIFailureAnalysis): SlackBlock => {
  const checkName = analysis.checkName || "CI";
  const sha = analysis.headSha
    ? analysis.headSha.substring(0, GIT_DISPLAY.SHA_DISPLAY_LENGTH)
    : "";

  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `${checkName} • ${sha}`,
      },
    ],
  };
};

/**
 * Formats CI failure analysis into concise Slack Block Kit blocks.
 *
 * Focused on answering: What broke? How to fix it?
 *
 * @param analysis - The CI failure analysis data
 * @returns Array of Slack blocks
 */
export const formatCIFailureBlocks = (analysis: CIFailureAnalysis): SlackBlock[] => {
  // Collect errors using shared utility
  const errors = collectCIErrors(
    analysis.annotations,
    analysis.testFailures,
    { includeEmoji: false }
  );

  // Build blocks array, filtering out nulls
  const blocks: SlackBlock[] = [
    createHeaderBlock(analysis.repository),
    createMainMessageBlock(analysis),
    createErrorsBlock(errors),
    createFixBlock(analysis),
    createFooterBlock(analysis),
  ].filter((block): block is SlackBlock => block !== null);

  return blocks;
};

/**
 * Creates Slack attachments with colored border for the analysis.
 *
 * Color is based on confidence level:
 * - Green for high confidence (>=0.8)
 * - Yellow for medium confidence (>=0.5)
 * - Red for low confidence (<0.5)
 *
 * @param analysis - The CI failure analysis data
 * @returns Array of message attachments
 */
export const createAnalysisAttachments = (analysis: CIFailureAnalysis): MessageAttachment[] => {
  const color = getConfidenceColor(analysis.confidence);

  return [
    {
      color,
      fallback: `CI Failure Analysis for ${analysis.repository}`,
      blocks: formatCIFailureBlocks(analysis),
    },
  ];
};
