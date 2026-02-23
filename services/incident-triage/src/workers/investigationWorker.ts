/**
 * Investigation Worker
 *
 * Polls the investigation queue for incoming investigation jobs, runs the
 * four-phase pipeline (parse intent, gather evidence, correlate, diagnose),
 * and persists results at each step.
 *
 * Receives all dependencies via TriageContainer (composition root pattern).
 * Follows the polling loop pattern from triageWorker.ts.
 *
 * @module workers/investigationWorker
 */

import {
  createLogger,
  delay,
  getInvestigationById,
  updateInvestigationStatus,
  updateInvestigationIntent,
  updateInvestigationEvidence,
  updateInvestigationCorrelation,
  updateInvestigationDiagnosis,
  updateInvestigationError,
  getErrorMessage,
  publish,
  PUBSUB_CHANNELS,
  type RequestContext,
  type QueueMessage,
} from "@kenchi/shared";
import {
  INVESTIGATION_WORKER_DEFAULTS,
  type InvestigationWorkerState,
  type InvestigationWorkerControl,
  type InvestigationWorkerStats,
  type InvestigationIntent,
  type InvestigationCorrelation,
  type InvestigationQueuePayload,
  type InvestigationEvidenceItem,
} from "../types/investigationTypes.js";
import type { TriageContainer } from "../types/containerTypes.js";
import {
  createInvestigationJobContext,
  stopInvestigationWorker,
  incrementInvestigationCounter,
  createInvestigationStatsSnapshot,
} from "./investigationWorkerHelpers.js";

const logger = createLogger("investigation-worker");

// ==================== Pipeline Phases ====================

/**
 * Phase 1: Parse the natural-language description into structured intent.
 */
const runParseIntent = async (
  container: TriageContainer,
  investigationId: string,
  description: string,
  context: RequestContext
): Promise<InvestigationIntent> => {
  logger.info("Investigation phase started", {
    investigationId,
    phase: "parseIntent",
    ...context,
  });

  await updateInvestigationStatus(investigationId, "parsing");

  const intent = await container.investigationService.parseIntent(description, context);

  await updateInvestigationIntent(investigationId, {
    serviceName: intent.serviceName,
    endpoint: intent.endpoint,
    symptom: intent.symptom,
    environment: intent.environment,
    timeRangeFrom: intent.timeRangeFrom ? new Date(intent.timeRangeFrom) : null,
    timeRangeTo: intent.timeRangeTo ? new Date(intent.timeRangeTo) : null,
  });

  return intent;
};

/**
 * Phase 2: Gather evidence from historical data sources.
 */
const runGatherEvidence = async (
  container: TriageContainer,
  investigationId: string,
  intent: InvestigationIntent,
  tenantId: string,
  context: RequestContext
): Promise<readonly unknown[]> => {
  logger.info("Investigation phase started", {
    investigationId,
    phase: "gatherEvidence",
    ...context,
  });

  await updateInvestigationStatus(investigationId, "gathering");

  const evidence = await container.investigationService.gatherEvidence(intent, tenantId, context);

  await updateInvestigationEvidence(investigationId, evidence);

  return evidence;
};

/**
 * Phase 3: Correlate evidence to find patterns and timeline.
 */
const runCorrelateEvidence = async (
  container: TriageContainer,
  investigationId: string,
  evidence: readonly unknown[],
  intent: InvestigationIntent,
  context: RequestContext
): Promise<InvestigationCorrelation> => {
  logger.info("Investigation phase started", {
    investigationId,
    phase: "correlateEvidence",
    ...context,
  });

  await updateInvestigationStatus(investigationId, "correlating");

  const typedEvidence = evidence as readonly InvestigationEvidenceItem[];

  const correlation = await container.investigationService.correlateEvidence(
    typedEvidence,
    intent,
    context
  );

  await updateInvestigationCorrelation(
    investigationId,
    correlation as unknown as Readonly<Record<string, unknown>>
  );

  return correlation;
};

/**
 * Phase 4: Diagnose root cause and produce recommendations.
 */
const runDiagnose = async (
  container: TriageContainer,
  investigationId: string,
  pipelineData: {
    readonly intent: InvestigationIntent;
    readonly evidence: readonly unknown[];
    readonly correlation: InvestigationCorrelation;
    readonly durationMs: number;
  },
  context: RequestContext
): Promise<{ readonly diagnosisSource: string; readonly confidence: number }> => {
  const { intent, evidence, correlation, durationMs } = pipelineData;

  logger.info("Investigation phase started", {
    investigationId,
    phase: "diagnose",
    ...context,
  });

  await updateInvestigationStatus(investigationId, "diagnosing");

  const typedEvidence = evidence as readonly InvestigationEvidenceItem[];

  const diagnosis = await container.investigationService.diagnose(
    intent,
    typedEvidence,
    correlation,
    context
  );

  await updateInvestigationDiagnosis(
    investigationId,
    diagnosis as unknown as Readonly<Record<string, unknown>>,
    durationMs
  );

  return {
    diagnosisSource: diagnosis.diagnosisSource,
    confidence: diagnosis.confidence,
  };
};

// ==================== Job Processing ====================

/**
 * Runs the full four-phase investigation pipeline.
 * Extracted so handleQueueMessage can catch errors and record them.
 */
const runInvestigationPipeline = async (
  container: TriageContainer,
  investigationId: string,
  description: string,
  tenantId: string,
  startTime: number,
  context: RequestContext
): Promise<{ readonly diagnosisSource: string; readonly confidence: number }> => {
  // Phase 1: Parse Intent
  const intent = await runParseIntent(container, investigationId, description, context);

  // Phase 2: Gather Evidence
  const evidence = await runGatherEvidence(container, investigationId, intent, tenantId, context);

  // Phase 3: Correlate
  const correlation = await runCorrelateEvidence(
    container,
    investigationId,
    evidence,
    intent,
    context
  );

  // Phase 4: Diagnose
  const durationMs = Date.now() - startTime;

  return runDiagnose(
    container,
    investigationId,
    { intent, evidence, correlation, durationMs },
    context
  );
};

/**
 * Queue message handler. Fetches the investigation record, runs the pipeline,
 * and records success/error.
 */
const handleQueueMessage = async (
  container: TriageContainer,
  message: QueueMessage<InvestigationQueuePayload>,
  state: InvestigationWorkerState
): Promise<{
  readonly success: boolean;
  readonly error?: string;
  readonly shouldRetry?: boolean;
}> => {
  const { investigationId, tenantId, initiatedBy } = message.payload;

  if (!investigationId) {
    return { success: false, error: "Missing investigationId in queue message payload" };
  }

  const investigation = await getInvestigationById(investigationId);

  if (!investigation) {
    logger.error("Investigation not found", { investigationId });
    return { success: false, error: "Investigation not found" };
  }

  const context = createInvestigationJobContext(tenantId, initiatedBy);
  const startTime = Date.now();

  try {
    const { diagnosisSource, confidence } = await runInvestigationPipeline(
      container,
      investigationId,
      investigation.description,
      tenantId,
      startTime,
      context
    );

    incrementInvestigationCounter(state, "totalProcessed");

    // Publish SSE event (fire-and-forget — don't fail if publish fails)
    void (async () => {
      try {
        await publish(PUBSUB_CHANNELS.INVESTIGATION, "investigation_completed", {
          investigationId,
          status: "completed",
        });
      } catch (publishError) {
        logger.warn("Failed to publish investigation completed event", {
          investigationId,
          error: getErrorMessage(publishError),
        });
      }
    })();

    const durationMs = Date.now() - startTime;

    logger.info("Investigation completed", {
      investigationId,
      durationMs,
      diagnosisSource,
      confidence,
      ...context,
    });

    return { success: true };
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    await updateInvestigationError(investigationId, errorMessage);
    incrementInvestigationCounter(state, "totalErrors");

    logger.error("Investigation failed", {
      investigationId,
      error: errorMessage,
      ...context,
    });

    return { success: false, error: errorMessage, shouldRetry: true };
  }
};

// ==================== Worker Polling Loop ====================

/**
 * Starts the investigation worker polling loop.
 *
 * Polls the investigation queue for messages and processes each investigation
 * through the four-phase pipeline (parse intent, gather evidence, correlate,
 * diagnose).
 *
 * @param container - Fully-wired TriageContainer from composition root
 * @returns Control interface with stop() and getStats() methods
 */
export const startInvestigationWorker = (
  container: TriageContainer
): InvestigationWorkerControl => {
  // Mutable worker state — requires mutation for running flag and counters
  const state: InvestigationWorkerState = {
    running: true,
    totalProcessed: 0,
    totalErrors: 0,
  };

  const pollLoop = async (): Promise<void> => {
    while (state.running) {
      try {
        await container.investigationQueue.process<InvestigationQueuePayload>(async (message) =>
          handleQueueMessage(container, message, state)
        );
      } catch (error) {
        logger.error("Investigation worker processing error", {
          error: getErrorMessage(error),
        });
      }

      const pollDelay = state.running ? INVESTIGATION_WORKER_DEFAULTS.POLL_INTERVAL_MS : 0;

      if (pollDelay > 0) {
        await delay(pollDelay);
      }
    }

    logger.info("Investigation worker stopped");
  };

  // Fire-and-forget the polling loop
  void pollLoop();

  logger.info("Investigation worker started", {
    pollIntervalMs: INVESTIGATION_WORKER_DEFAULTS.POLL_INTERVAL_MS,
  });

  return {
    stop: (): void => {
      stopInvestigationWorker(state);
      logger.info("Investigation worker stopping", {
        totalProcessed: state.totalProcessed,
        totalErrors: state.totalErrors,
      });
    },
    getStats: (): InvestigationWorkerStats => createInvestigationStatsSnapshot(state),
  };
};
