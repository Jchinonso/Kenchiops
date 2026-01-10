/**
 * Slack Feedback Block Builders
 *
 * Builds blocks for collecting user feedback in Slack messages:
 * - RAG feedback buttons for knowledge document quality
 * - Analysis feedback buttons for overall analysis quality
 * - Recommended actions summary
 */

import {
  UI_EMOJI,
  SLACK_ACTION_IDS,
  buildReviewActionText,
  type RecommendedAction,
  type RelatedKnowledgeDoc,
} from "@kenchi/shared";
import { DISPLAY_LIMITS, getPriorityEmoji } from "./formatterUtils.js";
import type {
  SlackTextBlock,
  SlackActionsBlock,
  RAGFeedbackButtonValue,
} from "./slackBlockTypes.js";

// ==================== Feedback Block Builders ====================

/**
 * Build RAG feedback buttons block for knowledge documents.
 * Allows users to rate whether retrieved knowledge was helpful.
 */
export const buildRAGFeedbackButtonsBlock = (
  docs: readonly RelatedKnowledgeDoc[],
  analysisId: string
): SlackActionsBlock | null => {
  if (docs.length === 0) {
    return null;
  }

  const topDoc = docs[0];
  const feedbackValue: RAGFeedbackButtonValue = {
    analysisId,
    knowledgeDocId: topDoc.id,
    similarity: topDoc.similarity,
    rank: 1,
  };

  const valueString = JSON.stringify(feedbackValue);

  return {
    type: "actions",
    block_id: "rag_feedback_block",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: `${UI_EMOJI.thumbsUp} Helpful`, emoji: true },
        style: "primary",
        value: valueString,
        action_id: SLACK_ACTION_IDS.RAG_FEEDBACK_HELPFUL,
      },
      {
        type: "button",
        text: { type: "plain_text", text: `${UI_EMOJI.thumbsDown} Not Helpful`, emoji: true },
        value: valueString,
        action_id: SLACK_ACTION_IDS.RAG_FEEDBACK_NOT_HELPFUL,
      },
    ],
  };
};

/**
 * Build analysis feedback buttons block for passive learning.
 * Always shown to collect user feedback on analysis quality.
 */
export const buildAnalysisFeedbackButtonsBlock = (analysisId: string): SlackActionsBlock => ({
  type: "actions",
  block_id: "analysis_feedback_block",
  elements: [
    {
      type: "button",
      text: { type: "plain_text", text: `${UI_EMOJI.thumbsUp} Helpful`, emoji: true },
      style: "primary",
      value: JSON.stringify({ analysisId, feedback: "positive" }),
      action_id: SLACK_ACTION_IDS.FEEDBACK_HELPFUL,
    },
    {
      type: "button",
      text: { type: "plain_text", text: `${UI_EMOJI.thumbsDown} Not Helpful`, emoji: true },
      value: JSON.stringify({ analysisId, feedback: "negative" }),
      action_id: SLACK_ACTION_IDS.FEEDBACK_NOT_HELPFUL,
    },
  ],
});

// ==================== Actions Summary Block ====================

/**
 * Build recommended actions summary blocks
 */
export const buildActionsSummaryBlocks = (
  actions: readonly RecommendedAction[]
): SlackTextBlock[] => {
  if (actions.length === 0) {
    return [];
  }

  const actionText = actions
    .slice(0, DISPLAY_LIMITS.slackMaxChecks)
    .map((action, actionIndex) => {
      const { servicePrefix, title, detail } = buildReviewActionText(
        action.description,
        action.reasoning
      );
      return `${actionIndex + 1}. *${getPriorityEmoji(action.priority)} ${servicePrefix}${title}*\n   ${detail}`;
    })
    .join("\n\n");

  return [
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${UI_EMOJI.tools} Recommended Areas to Review*` },
    },
    { type: "section", text: { type: "mrkdwn", text: actionText } },
  ];
};
