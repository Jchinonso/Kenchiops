/**
 * Q&A Response Formatter for Slack messages.
 *
 * Formats RAG search results as rich Slack Block Kit messages
 * with source links and feedback buttons.
 *
 * @module formatters/qaFormatter
 */

import {
  QA_ACTION_IDS,
  QA_MESSAGES,
  QA_CONFIG,
  UI_CONSTANTS,
  UI_EMOJI,
  DOC_TYPE_EMOJI_MAP,
  NUMBER_EMOJI_LIST,
} from "@kenchi/shared";
import type { SlackBlock } from "../types/slackTypes.js";
import type { QASearchResult, QASearchResponse } from "../services/qaService.js";

// ==================== Block Factory Functions ====================

/**
 * Creates a header block with plain text.
 */
const createHeaderBlock = (text: string): SlackBlock => ({
  type: "header",
  text: { type: "plain_text", text, emoji: true },
});

/**
 * Creates a section block with mrkdwn text.
 */
const createSectionBlock = (text: string): SlackBlock => ({
  type: "section",
  text: { type: "mrkdwn", text },
});

/**
 * Creates a context block with mrkdwn text.
 */
const createContextBlock = (text: string): SlackBlock => ({
  type: "context",
  elements: [{ type: "mrkdwn", text }],
});

/**
 * Creates a divider block.
 */
const createDividerBlock = (): SlackBlock => ({ type: "divider" });

// ==================== Result Formatting ====================

/**
 * Gets the emoji for a document type.
 */
const getDocTypeEmoji = (docType: string): string =>
  DOC_TYPE_EMOJI_MAP[docType] ?? UI_EMOJI.document;

/**
 * Formats a document type label with emoji.
 */
const formatDocTypeLabel = (docType: string): string => {
  const emoji = getDocTypeEmoji(docType);
  const label = docType.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  return `${emoji} ${label}`;
};

/**
 * Formats similarity score as percentage.
 */
const formatSimilarity = (similarity: number): string => {
  const percent = Math.round(similarity * UI_CONSTANTS.PERCENTAGE_MULTIPLIER);
  return `${percent}% match`;
};

/**
 * Gets the number emoji for a result index.
 */
const getNumberEmoji = (index: number): string => NUMBER_EMOJI_LIST[index] ?? `${index + 1}.`;

/**
 * Truncates query for display in context.
 */
const truncateQueryForDisplay = (query: string): string => {
  const maxLength = QA_CONFIG.MAX_DISPLAY_QUERY_LENGTH;
  return query.length > maxLength ? `${query.slice(0, maxLength)}...` : query;
};

/**
 * Formats a single search result as Slack blocks.
 */
const formatResultBlock = (result: QASearchResult, index: number): readonly SlackBlock[] => {
  const numberEmoji = getNumberEmoji(index);
  const docTypeLabel = formatDocTypeLabel(result.docType);
  const similarityLabel = formatSimilarity(result.similarity);

  // Title with optional source link
  const titleText = result.sourceUrl
    ? `${numberEmoji} *<${result.sourceUrl}|${result.title}>*`
    : `${numberEmoji} *${result.title}*`;

  const blocks: SlackBlock[] = [
    createSectionBlock(`${titleText}\n${docTypeLabel} • ${similarityLabel}`),
    createSectionBlock(`> ${result.snippet.replace(/\n/g, "\n> ")}`),
  ];

  return blocks;
};

/**
 * Creates feedback buttons for Q&A results.
 */
const createQAFeedbackButtons = (queryId: string): SlackBlock => ({
  type: "actions",
  elements: [
    {
      type: "button",
      text: {
        type: "plain_text",
        text: `${UI_EMOJI.thumbsUp} Helpful`,
        emoji: true,
      },
      style: "primary",
      value: queryId,
      action_id: QA_ACTION_IDS.QA_HELPFUL,
    },
    {
      type: "button",
      text: {
        type: "plain_text",
        text: `${UI_EMOJI.thumbsDown} Not helpful`,
        emoji: true,
      },
      value: queryId,
      action_id: QA_ACTION_IDS.QA_NOT_HELPFUL,
    },
  ],
});

// ==================== Public API ====================

/**
 * Formats a Q&A search response as Slack blocks.
 *
 * @param response - The Q&A search response
 * @param queryId - Unique ID for tracking feedback
 * @returns Slack Block Kit blocks for the response
 */
export const formatQAResponse = (response: QASearchResponse, queryId: string): SlackBlock[] => {
  const blocks: SlackBlock[] = [];

  // Handle error case
  if (!response.success && response.error) {
    blocks.push(createSectionBlock(`${UI_EMOJI.warning} ${response.error}`));
    return blocks;
  }

  // Handle no results
  if (response.results.length === 0) {
    blocks.push(createSectionBlock(`${UI_EMOJI.mag} ${QA_MESSAGES.NO_RESULTS}`));
    const truncatedQuery = truncateQueryForDisplay(response.query);
    blocks.push(
      createContextBlock(`Searched ${response.totalFound} documents • Query: "${truncatedQuery}"`)
    );
    return blocks;
  }

  // Header
  blocks.push(createHeaderBlock(`${UI_EMOJI.book} Knowledge Base Results`));

  // Results
  response.results.forEach((result, index) => {
    if (index > 0) {
      blocks.push(createDividerBlock());
    }
    blocks.push(...formatResultBlock(result, index));
  });

  // Footer with metadata
  blocks.push(createDividerBlock());
  const cacheIndicator = response.cacheHit ? " (cached)" : "";
  blocks.push(
    createContextBlock(
      `Found ${response.totalFound} relevant documents${cacheIndicator} • Showing top ${response.results.length}`
    )
  );

  // Feedback buttons
  blocks.push(createQAFeedbackButtons(queryId));

  return blocks;
};

/**
 * Formats a "searching" placeholder message.
 *
 * @returns Slack blocks for the searching message
 */
export const formatSearchingMessage = (): SlackBlock[] => [
  createSectionBlock(`${UI_EMOJI.hourglass} ${QA_MESSAGES.SEARCHING}`),
];

/**
 * Formats an error message for Q&A failures.
 *
 * @param error - The error message
 * @returns Slack blocks for the error message
 */
export const formatQAErrorMessage = (error: string): SlackBlock[] => [
  createSectionBlock(`${UI_EMOJI.warning} *Error*\n${error}`),
  createContextBlock("Please try again or rephrase your question."),
];
