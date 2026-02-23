/**
 * Analysis Service for Slack Bot
 *
 * Provides singleton LLM client and analysis utilities
 * for processing Slack commands and mentions.
 */

import {
  LLMClient,
  calculateConfidenceScore,
  createLogger,
  type Event,
  type Evidence,
  LLMError,
  getErrorMessage,
  wrapError,
  // Safety features
  checkForHallucinations,
  recordHallucinationDetection,
  type SafetyRequestContext,
} from "@kenchi/shared";
import type { SlackCommandPayload, SlackMentionPayload } from "../types/slackTypes.js";
import type { AnalysisResult } from "./analysisServiceTypes.js";

export type { AnalysisResult } from "./analysisServiceTypes.js";

const logger = createLogger("slack-bot");

/**
 * Singleton LLM client instance
 */
// let: lazy-initialized singleton, assigned once on first call
let llmClientInstance: LLMClient | null = null;

/**
 * Get or create the LLM client singleton
 */
export const getLLMClient = (): LLMClient => {
  if (!llmClientInstance) {
    llmClientInstance = new LLMClient();
    logger.info("LLM client initialized");
  }
  return llmClientInstance;
};

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
 * Performs analysis using the LLM client and returns results with confidence scoring.
 * Includes hallucination detection for safety.
 */
export const performAnalysis = async (event: Event, tenantId?: string): Promise<AnalysisResult> => {
  // Build safety context for audit logging early
  const safetyContext: SafetyRequestContext = {
    requestId: event.id,
    tenantId: tenantId ?? "system",
    actor: "system",
  };
  const evidence = createMinimalEvidence(event.id);
  const llmClient = getLLMClient();

  logger.info("Starting analysis", {
    eventId: event.id,
    type: event.type,
  });

  try {
    const analysis = await llmClient.analyzeIncident(event, evidence);
    const confidence = calculateConfidenceScore(analysis, evidence);

    // Check for hallucinations in the analysis using summary and reasoning
    const textToCheck = [analysis.summary, analysis.reasoning, analysis.identifiedCause]
      .filter(Boolean)
      .join(" ");
    const hallucinationCheck = checkForHallucinations(textToCheck);

    if (hallucinationCheck.isLikelyHallucinated) {
      logger.warn("Potential hallucination detected in analysis", {
        eventId: event.id,
        riskScore: hallucinationCheck.riskScore,
        indicatorCount: hallucinationCheck.indicators.length,
      });

      // Record hallucination detection in audit log
      try {
        await recordHallucinationDetection(
          hallucinationCheck.riskScore,
          hallucinationCheck.indicators.length,
          safetyContext
        );
      } catch (auditError) {
        logger.error("Failed to record hallucination audit", {
          error: getErrorMessage(auditError),
        });
      }
    }

    logger.info("Analysis completed", {
      eventId: event.id,
      confidence: confidence.finalScore,
      gating: confidence.gatingDecision,
      hallucinationRisk: hallucinationCheck.riskScore,
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
