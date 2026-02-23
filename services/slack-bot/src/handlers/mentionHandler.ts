/**
 * Handler for Slack app mentions.
 * Processes @kenchi mentions and returns AI analysis or Q&A responses.
 */

import type { AppMentionEvent, SayFn } from "@slack/bolt";
import {
  createLogger,
  TIME_CONSTANTS,
  getErrorMessage,
  UI_EMOJI,
  isDocIngestionRequest,
  findTenantBySlackWorkspace,
} from "@kenchi/shared";
import { formatAnalysisMessage, formatErrorMessage } from "../formatters.js";
import { formatQAResponse, formatQAErrorMessage } from "../formatters/qaFormatter.js";
import { createEventFromMention, performAnalysis } from "../services/analysisService.js";
import { shouldTriggerQA, performQASearch, generateQueryId } from "../services/qaService.js";
import type { SlackBlock } from "../types/slackTypes.js";
import type { SlackBlocks } from "./actionHandlerTypes.js";

const logger = createLogger("slack-bot");

/**
 * Extracts query from mention text by removing bot mentions.
 */
const extractQueryFromMention = (text: string): string => text.replace(/<@[^>]+>/g, "").trim();

/**
 * Creates feedback buttons for the analysis response.
 */
const createFeedbackButtons = (eventId: string): SlackBlock[] => [
  {
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
        value: eventId,
        action_id: "feedback_helpful",
      },
      {
        type: "button",
        text: {
          type: "plain_text",
          text: `${UI_EMOJI.thumbsDown} Not helpful`,
          emoji: true,
        },
        value: eventId,
        action_id: "feedback_not_helpful",
      },
    ],
  },
];

/**
 * Handles Q&A requests by searching the knowledge base.
 */
const handleQARequest = async (
  query: string,
  userId: string,
  threadTs: string,
  say: SayFn
): Promise<void> => {
  logger.info("Processing Q&A request", {
    queryLength: query.length,
    userId,
  });

  try {
    const queryId = generateQueryId(query, userId);
    const response = await performQASearch(query);

    logger.info("Q&A search completed", {
      queryId,
      resultCount: response.results.length,
      totalFound: response.totalFound,
      cacheHit: response.cacheHit,
    });

    const blocks = formatQAResponse(response, queryId);

    await say({
      blocks: blocks as SlackBlocks,
      thread_ts: threadTs,
    });
  } catch (error) {
    logger.error("Q&A request failed", {
      error: getErrorMessage(error),
    });

    const errorBlocks = formatQAErrorMessage(getErrorMessage(error));
    await say({
      blocks: errorBlocks as SlackBlocks,
      thread_ts: threadTs,
    });
  }
};

/**
 * Handles analysis requests using AI analysis.
 */
const handleAnalysisRequest = async (
  query: string,
  userId: string,
  channel: string,
  threadTs: string,
  eventTs: string,
  say: SayFn,
  tenantId?: string
): Promise<void> => {
  const timestamp = new Date(
    parseFloat(eventTs) * TIME_CONSTANTS.MILLISECONDS_PER_SECOND
  ).toISOString();

  const analysisEvent = createEventFromMention(userId, channel, query, threadTs);

  // Override timestamp with actual event timestamp
  const eventWithCorrectTime = {
    ...analysisEvent,
    timestamp,
  };

  const { analysis, confidence } = await performAnalysis(eventWithCorrectTime, tenantId);

  logger.info("Mention analysis completed", {
    eventId: analysisEvent.id,
    confidence: confidence.finalScore,
  });

  const blocks = formatAnalysisMessage(analysis, confidence);

  await say({
    blocks: blocks as SlackBlocks,
    thread_ts: eventTs,
  });

  const feedbackBlocks = createFeedbackButtons(analysisEvent.id);
  await say({
    blocks: feedbackBlocks as SlackBlocks,
    thread_ts: eventTs,
  });
};

/**
 * Handles document ingestion requests.
 * Guides user to use the slash command or file upload.
 */
const handleDocIngestionRequest = async (
  query: string,
  threadTs: string,
  say: SayFn
): Promise<void> => {
  logger.info("Document ingestion request detected", { query: query.slice(0, 50) });

  // Guide user to proper methods for adding documents
  await say({
    text:
      `${UI_EMOJI.info} To add a document to the knowledge base:\n\n` +
      `1. *Slash command:* Use \`/kenchi add-doc\` to open a form and paste content directly\n` +
      `2. *File upload:* Upload a \`.md\` or \`.txt\` file to this channel and mention me with "ingest this"\n\n` +
      `_Example: Upload a file, then type "@Kenchi ingest this"_`,
    thread_ts: threadTs,
  });
};

/**
 * Handles app mention events.
 * Routes to Q&A for questions, document ingestion, or analysis for other requests.
 *
 * @param event - Slack app mention event
 * @param say - Function to send messages
 */
export const handleAppMention = async (event: AppMentionEvent, say: SayFn): Promise<void> => {
  logger.info("Bot mentioned", {
    text: event.text,
    user: event.user,
    channel: event.channel,
  });

  try {
    const query = extractQueryFromMention(event.text);
    const userId = event.user ?? "unknown";
    const threadTs = event.thread_ts ?? event.ts;

    // Route to document ingestion guidance if requested
    if (isDocIngestionRequest(query)) {
      await handleDocIngestionRequest(query, threadTs, say);
      return;
    }

    // Route to Q&A if the query looks like a question
    if (shouldTriggerQA(query)) {
      logger.info("Routing to Q&A handler", { query: query.slice(0, 50) });
      await handleQARequest(query, userId, threadTs, say);
      return;
    }

    // Otherwise, perform AI analysis
    logger.info("Routing to analysis handler", { query: query.slice(0, 50) });
    const tenant = event.team ? await findTenantBySlackWorkspace(event.team) : null;
    await handleAnalysisRequest(query, userId, event.channel, threadTs, event.ts, say, tenant?.id);
  } catch (error) {
    logger.error("Error processing app mention", {
      error: getErrorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    const errorBlocks = formatErrorMessage(
      error instanceof Error ? error : new Error("Unknown error")
    );

    await say({
      blocks: errorBlocks as SlackBlocks,
      thread_ts: event.ts,
    });
  }
};
