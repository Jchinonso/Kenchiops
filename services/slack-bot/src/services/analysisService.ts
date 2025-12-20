/**
 * Analysis Service for Slack Bot
 *
 * Provides singleton OpenAI client and analysis utilities
 * for processing Slack commands and mentions.
 */

import {
  OpenAIClient,
  calculateConfidenceScore,
  createLogger,
  type Event,
  type Evidence,
  type LLMAnalysisResult,
  type ConfidenceScoreResult,
  LLMError,
  getErrorMessage,
  wrapError,
} from "@kenchi/shared";
import type { SlackCommandPayload, SlackMentionPayload } from "../types/slackTypes.js";

const logger = createLogger("slack-bot");

/**
 * Singleton OpenAI client instance
 */
let openaiClientInstance: OpenAIClient | null = null;

/**
 * Get or create the OpenAI client singleton
 */
export const getOpenAIClient = (): OpenAIClient => {
  if (!openaiClientInstance) {
    openaiClientInstance = new OpenAIClient();
    logger.info("OpenAI client initialized");
  }
  return openaiClientInstance;
};

/**
 * Analysis result with confidence scoring
 */
export interface AnalysisResult {
  readonly analysis: LLMAnalysisResult;
  readonly confidence: ConfidenceScoreResult;
  readonly event: Event;
}

/**
 * Creates an Event from a Slack command
 */
export const createEventFromCommand = (userId: string, channelId: string, text: string): Event => ({
  id: `evt_${Date.now()}_${userId}`,
  type: "MANUAL_TRIGGER",
  source: "slack",
  timestamp: new Date().toISOString(),
  severity: "medium",
  title: "Slack Command Analysis",
  payload: {
    command: text,
    user_id: userId,
    channel_id: channelId,
  } as SlackCommandPayload,
  metadata: {
    triggeredBy: userId,
  },
});

/**
 * Creates an Event from a Slack mention
 */
export const createEventFromMention = (
  userId: string,
  channelId: string,
  query: string,
  threadTs?: string
): Event => ({
  id: `evt_${Date.now()}_${userId}`,
  type: "MANUAL_TRIGGER",
  source: "slack",
  timestamp: new Date().toISOString(),
  severity: "medium",
  title: "Slack Mention Analysis",
  payload: {
    query,
    channel: channelId,
    user: userId,
    thread_ts: threadTs,
  } as SlackMentionPayload,
  metadata: {
    triggeredBy: userId,
  },
});

/**
 * Creates minimal evidence for analysis
 */
export const createMinimalEvidence = (eventId: string): Evidence => ({
  eventId,
  collectedAt: new Date().toISOString(),
  logs: [],
});

/**
 * Performs analysis using OpenAI and returns results with confidence scoring
 */
export const performAnalysis = async (event: Event): Promise<AnalysisResult> => {
  const evidence = createMinimalEvidence(event.id);
  const openaiClient = getOpenAIClient();

  logger.info("Starting analysis", {
    eventId: event.id,
    type: event.type,
  });

  try {
    const analysis = await openaiClient.analyzeIncident(event, evidence);
    const confidence = calculateConfidenceScore(analysis, evidence);

    logger.info("Analysis completed", {
      eventId: event.id,
      confidence: confidence.finalScore,
      gating: confidence.gatingDecision,
    });

    return { analysis, confidence, event };
  } catch (error) {
    logger.error("Analysis failed", {
      eventId: event.id,
      error: getErrorMessage(error),
    });

    throw new LLMError(wrapError("Failed to analyze", error));
  }
};
