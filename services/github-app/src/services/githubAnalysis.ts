/**
 * GitHub Analysis Functions
 *
 * Event creation and OpenAI analysis functions for GitHub webhooks.
 */

import {
  createLogger,
  OpenAIClient,
  calculateConfidenceScore,
  generateEventId,
  type Event,
  type Evidence,
  type LLMAnalysisResult,
  type ConfidenceScoreResult,
  LLMError,
  getErrorMessage,
  wrapError,
  // Safety features
  checkForHallucinations,
  recordHallucinationDetection,
  type SafetyRequestContext,
} from "@kenchi/shared";
import type { PullRequestWebhook, CheckRunWebhook } from "../types/githubTypes.js";

const logger = createLogger("github-app");

// ==================== Singleton Client ====================

/** Singleton OpenAI client */
let openaiClientInstance: OpenAIClient | null = null;

/**
 * Get or create the OpenAI client singleton.
 */
export const getOpenAIClient = (): OpenAIClient => {
  if (!openaiClientInstance) {
    openaiClientInstance = new OpenAIClient();
    logger.info("OpenAI client initialized");
  }
  return openaiClientInstance;
};

// ==================== Types ====================

/**
 * Analysis result with confidence scoring
 */
export interface AnalysisResult {
  readonly analysis: LLMAnalysisResult;
  readonly confidence: ConfidenceScoreResult;
  readonly event: Event;
}

// ==================== Event Creation ====================

/**
 * Create an Event from a pull request webhook.
 */
export const createEventFromPR = (webhook: PullRequestWebhook): Event => ({
  id: generateEventId("pr"),
  type: "MANUAL_TRIGGER",
  source: "github",
  timestamp: new Date().toISOString(),
  severity: "medium",
  title: `PR #${webhook.pull_request.number}: ${webhook.pull_request.title}`,
  payload: {
    action: webhook.action,
    prNumber: webhook.pull_request.number,
    title: webhook.pull_request.title,
    body: webhook.pull_request.body || "",
    repository: webhook.repository.full_name,
    author: webhook.pull_request.user.login,
    headSha: webhook.pull_request.head.sha,
    baseBranch: webhook.pull_request.base.ref,
    headBranch: webhook.pull_request.head.ref,
  },
  metadata: {
    owner: webhook.repository.owner.login,
    repo: webhook.repository.name,
    installationId: webhook.installation?.id,
  },
});

/**
 * Create an Event from a check run webhook.
 */
export const createEventFromCheckRun = (webhook: CheckRunWebhook): Event => ({
  id: generateEventId("check"),
  type: "CICD_FAILURE",
  source: "github",
  timestamp: new Date().toISOString(),
  severity: "high",
  title: `CI Failure: ${webhook.check_run.name}`,
  payload: {
    action: webhook.action,
    checkName: webhook.check_run.name,
    conclusion: webhook.check_run.conclusion,
    repository: webhook.repository.full_name,
    output: webhook.check_run.output,
    headSha: webhook.check_run.head_sha,
    pullRequestCount: webhook.check_run.pull_requests.length,
  },
  metadata: {
    owner: webhook.repository.owner.login,
    repo: webhook.repository.name,
    installationId: webhook.installation?.id,
    checkRunId: webhook.check_run.id,
    headSha: webhook.check_run.head_sha,
  },
});

/**
 * Create minimal evidence for analysis.
 */
export const createMinimalEvidence = (eventId: string): Evidence => ({
  eventId,
  collectedAt: new Date().toISOString(),
  logs: [],
});

// ==================== Analysis ====================

/**
 * Perform OpenAI analysis on an event.
 * Includes hallucination detection for safety.
 */
export const performAnalysis = async (event: Event): Promise<AnalysisResult> => {
  // Build safety context for audit logging early
  const safetyContext: SafetyRequestContext = {
    requestId: event.id,
    tenantId: "github",
    actor: "system",
  };
  const evidence = createMinimalEvidence(event.id);
  const openaiClient = getOpenAIClient();

  logger.info("Starting analysis", {
    eventId: event.id,
    type: event.type,
  });

  try {
    const analysis = await openaiClient.analyzeIncident(event, evidence);
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
