/**
 * Triage Worker
 *
 * Polls the incident triage queue for incoming alerts, runs deduplication,
 * severity classification, runbook matching, incident correlation, and
 * evidence aggregation, then persists triage results.
 *
 * Receives all dependencies via TriageContainer (composition root pattern).
 * Follows the polling loop pattern from services/api/src/workers/analysisWorker.ts.
 *
 * @module workers/triageWorker
 */

import {
  createLogger,
  delay,
  getAlertById,
  updateAlertStatus,
  createTriageResult,
  updateTriageEnrichment,
  updateTriageAiSummary,
  updateTriageDispatchResults,
  getErrorMessage,
  publish,
  SERVICE_NAMES,
  PUBSUB_CHANNELS,
  DASHBOARD_EVENT_TYPES,
  type RequestContext,
  type QueueMessage,
  type IncidentAlertRecord,
} from "@kenchi/shared";
import type {
  TriageWorkerState,
  TriageWorkerStats,
  TriageWorkerControl,
  PolicyDispatchInput,
} from "../types/severityTypes.js";
import type { TriagePolicyContext } from "../types/policyTypes.js";
import type { IncidentSummaryResponse } from "../types/summaryTypes.js";
import type { TriageContainer } from "../types/containerTypes.js";
import { classifyAlertSeverity } from "../services/severityClassifier.js";
import { aggregateEvidence } from "../services/evidenceAggregator.js";
import { evaluatePolicy } from "../services/policyEngine.js";
import { formatSlackBlocks } from "../formatters/slackFormatter.js";
import { TRIAGE_WORKER_DEFAULTS, DEFAULT_SEVERITY_CONFIG } from "../constants/triageConstants.js";
import { DEFAULT_POLICY_RULES } from "../constants/policyRules.js";
import {
  toNormalizedAlert,
  buildEmbeddingText,
  createJobContext,
  stopWorker,
  incrementCounter,
  serializeSeverityFactors,
  createStatsSnapshot,
} from "./triageWorkerHelpers.js";

const logger = createLogger(SERVICE_NAMES.INCIDENT_TRIAGE);

// ==================== Phase 5 Helper ====================

/**
 * Runs policy evaluation, formats Slack blocks, dispatches notifications,
 * and persists dispatch results. Extracted from processAlert to stay under
 * the max-lines-per-function limit.
 */
const runPolicyAndDispatch = async (
  container: TriageContainer,
  input: PolicyDispatchInput,
  context: RequestContext
): Promise<{
  readonly dispatchResults: {
    readonly totalTargets: number;
    readonly successCount: number;
    readonly failureCount: number;
  };
  readonly dispatchDurationMs: number;
}> => {
  const {
    alertId,
    tenantId,
    normalizedAlert,
    severityScore,
    evidenceCatalog,
    summaryResult,
    triageResultId,
    startTime,
  } = input;

  // Step 12: Policy evaluation
  const triagePolicyContext: TriagePolicyContext = {
    alertId,
    tenantId,
    severityLabel: severityScore.label as TriagePolicyContext["severityLabel"],
    severityScore: severityScore.total,
    environment: normalizedAlert.environment,
    serviceName: normalizedAlert.serviceName,
    confidence: evidenceCatalog.confidence.total,
    completeness: evidenceCatalog.completeness.total,
    headline: summaryResult.headline,
    summarySource: summaryResult.summarySource,
  };

  const routingDecision = evaluatePolicy(triagePolicyContext, DEFAULT_POLICY_RULES);

  // Step 13: Format and dispatch notifications
  const slackBlocks = formatSlackBlocks({
    alertId,
    headline: summaryResult.headline,
    rootCauseSummary: summaryResult.rootCauseSummary,
    impactAssessment: summaryResult.impactAssessment,
    severityLabel: severityScore.label as TriagePolicyContext["severityLabel"],
    severityScore: severityScore.total,
    confidence: evidenceCatalog.confidence.total,
    completeness: evidenceCatalog.completeness.total,
    summarySource: summaryResult.summarySource,
    environment: normalizedAlert.environment,
    serviceName: normalizedAlert.serviceName,
    matchedRules: routingDecision.matchedRules,
  });

  const results = await container.dispatchService.dispatch(
    routingDecision,
    triagePolicyContext,
    slackBlocks as Array<Record<string, unknown>>,
    context
  );

  // Step 14: Persist dispatch results
  const dispatchDurationMs = Date.now() - startTime;

  await updateTriageDispatchResults({
    triageResultId,
    // Cast for JSONB column storage — typed object is structurally compatible
    routingDecision: routingDecision as unknown as Record<string, unknown>,
    dispatchedTo: results.results.map((dr) => ({
      targetType: dr.target.type,
      channel: dr.target.channel,
      success: dr.success,
      statusCode: dr.statusCode,
      error: dr.error,
      durationMs: dr.durationMs,
    })),
    pipelineDurationMs: dispatchDurationMs,
  });

  return { dispatchResults: results, dispatchDurationMs };
};

// ==================== Job Processing ====================

/**
 * Runs the full triage pipeline after the alert status has been set to "processing".
 * Extracted so processAlert can catch errors and reset status to "error".
 */
const runTriagePipeline = async (
  container: TriageContainer,
  alert: IncidentAlertRecord,
  alertId: string,
  state: TriageWorkerState,
  startTime: number,
  context: RequestContext
): Promise<void> => {
  // Step 2: Deduplication check
  const tenantId = alert.tenantId ?? "system";
  const fingerprint = alert.fingerprint ?? "";

  const dedupResult = await container.dedupService.checkDuplicate(fingerprint, tenantId, context);

  if (dedupResult.isDuplicate) {
    await updateAlertStatus(alertId, "deduped");
    incrementCounter(state, "totalDeduped");
    const durationMs = Date.now() - startTime;

    logger.info("Alert deduped, skipping triage", {
      alertId,
      existingAlertId: dedupResult.existingAlertId,
      durationMs,
      ...context,
    });
    return;
  }

  // Step 3: Register fingerprint for future dedup
  await container.dedupService.registerAlert(fingerprint, tenantId, alertId, undefined, context);

  // Step 4: Severity classification
  const normalizedAlert = toNormalizedAlert(alert);
  const severityScore = classifyAlertSeverity(normalizedAlert, DEFAULT_SEVERITY_CONFIG);

  // Step 5: Create initial triage result (severity only)
  const severityDurationMs = Date.now() - startTime;

  const triageResult = await createTriageResult({
    alertId,
    tenantId: alert.tenantId,
    severityScore: severityScore.total,
    severityLabel: severityScore.label,
    severityFactors: serializeSeverityFactors(severityScore.factors),
    pipelineDurationMs: severityDurationMs,
  });

  // Step 6: Runbook matching (Phase 3) — also returns embedding for reuse
  const embeddingText = buildEmbeddingText(normalizedAlert);
  const runbookResult = await container.runbookMatcher.matchRunbooks(
    embeddingText,
    tenantId,
    context
  );

  // Step 7: Incident correlation (Phase 3) — reuse embedding from runbook matcher (H2)
  const alertEmbedding = runbookResult.embedding;

  const correlationResult = await container.incidentCorrelator.correlateIncident(
    alertEmbedding,
    alertId,
    tenantId,
    normalizedAlert.serviceName,
    context
  );

  // Step 8: Evidence aggregation (Phase 3)
  const evidenceCatalog = aggregateEvidence({
    alert: normalizedAlert,
    severity: severityScore,
    runbooks: runbookResult.matches,
    correlations: correlationResult.correlations,
  });

  // Step 9: Update triage result with enrichment data
  const fullDurationMs = Date.now() - startTime;

  await updateTriageEnrichment({
    triageResultId: triageResult.id,
    confidence: evidenceCatalog.confidence.total,
    completeness: evidenceCatalog.completeness.total,
    missingFields: evidenceCatalog.completeness.missingFields,
    matchedRunbooks: runbookResult.matches.map((match) => ({
      docId: match.docId,
      title: match.title,
      similarity: match.similarity,
      sourceUrl: match.sourceUrl,
    })),
    correlatedIncidents: correlationResult.correlations.map((corr) => ({
      triageResultId: corr.triageResultId,
      alertId: corr.alertId,
      similarity: corr.similarity,
      correlationType: corr.correlationType,
      severityLabel: corr.severityLabel,
    })),
    // Cast for JSONB column storage — typed object is structurally compatible
    evidenceCatalog: evidenceCatalog as unknown as Record<string, unknown>,
    alertEmbedding,
    pipelineDurationMs: fullDurationMs,
  });

  // Step 10: AI summarization with validation + fallback (Phase 4)
  const summaryResult = await container.aiSummarizer.summarize(
    {
      alert: normalizedAlert,
      severity: severityScore,
      runbooks: runbookResult.matches,
      correlations: correlationResult.correlations,
      evidenceCatalog,
    },
    context
  );

  // Step 11: Persist AI summary
  const summaryDurationMs = Date.now() - startTime;

  await updateTriageAiSummary({
    triageResultId: triageResult.id,
    // Cast for JSONB column storage — typed object is structurally compatible
    aiSummary: summaryResult as unknown as Record<string, unknown>,
    summarySource: summaryResult.summarySource,
    pipelineDurationMs: summaryDurationMs,
  });

  // Steps 12-14: Policy evaluation, dispatch, persist (Phase 5)
  const typedSummary = summaryResult as IncidentSummaryResponse;
  const { dispatchResults, dispatchDurationMs } = await runPolicyAndDispatch(
    container,
    {
      alertId,
      tenantId,
      normalizedAlert,
      severityScore,
      evidenceCatalog,
      summaryResult: typedSummary,
      triageResultId: triageResult.id,
      startTime,
    },
    context
  );

  // Step 15: Mark alert as triaged
  await updateAlertStatus(alertId, "triaged");

  // Step 16: Publish dashboard SSE notification (fire-and-forget)
  void (async () => {
    try {
      await publish(PUBSUB_CHANNELS.DASHBOARD, DASHBOARD_EVENT_TYPES.INCIDENT_TRIAGED, {
        tenantId,
        alertId,
        severity: severityScore.label,
        title: alert.title,
        aiSummary: typedSummary.headline ?? null,
      });
    } catch (publishError) {
      logger.warn("Failed to publish incident_triaged dashboard event", {
        alertId,
        error: getErrorMessage(publishError),
      });
    }
  })();

  const { length: matchCount } = runbookResult.matches;
  const { length: corrCount } = correlationResult.correlations;
  logger.info("Alert triage completed", {
    alertId,
    severityLabel: severityScore.label,
    severityTotal: severityScore.total,
    confidence: evidenceCatalog.confidence.total,
    completeness: evidenceCatalog.completeness.total,
    runbookMatches: matchCount,
    correlations: corrCount,
    summarySource: summaryResult.summarySource,
    dispatchTargets: dispatchResults.totalTargets,
    dispatchSuccess: dispatchResults.successCount,
    dispatchFailures: dispatchResults.failureCount,
    durationMs: dispatchDurationMs,
    ...context,
  });
};

/**
 * Processes a single alert through the full triage pipeline.
 */
const processAlert = async (
  container: TriageContainer,
  alertId: string,
  tenantId: string,
  state: TriageWorkerState
): Promise<void> => {
  const alert = await getAlertById(alertId, tenantId);

  if (!alert) {
    logger.warn("Alert not found for triage", { alertId });
    return;
  }

  const context = createJobContext(alert);
  const startTime = Date.now();

  logger.info("Processing alert for triage", {
    alertId,
    source: alert.source,
    severity: alert.severity,
    ...context,
  });

  // Step 1: Mark as processing
  await updateAlertStatus(alertId, "processing");

  // Wrap pipeline in try/catch to reset status on failure (C1: prevent stuck "processing")
  try {
    await runTriagePipeline(container, alert, alertId, state, startTime, context);
  } catch (error) {
    await updateAlertStatus(alertId, "error");
    throw error;
  }
};

/**
 * Queue message handler. Extracts alert ID and delegates to processAlert.
 */
const handleQueueMessage = async (
  container: TriageContainer,
  message: QueueMessage<{ readonly alertId: string; readonly tenantId: string | null }>,
  state: TriageWorkerState
): Promise<{ readonly success: boolean; readonly error?: string }> => {
  const { alertId, tenantId } = message.payload;

  if (!alertId) {
    return { success: false, error: "Missing alertId in queue message payload" };
  }

  if (!tenantId) {
    return { success: false, error: "Missing tenantId in queue message payload" };
  }

  try {
    await processAlert(container, alertId, tenantId, state);
    incrementCounter(state, "totalProcessed");
    return { success: true };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    incrementCounter(state, "totalErrors");

    logger.error("Alert triage failed", {
      alertId,
      messageId: message.id,
      error: errorMessage,
    });

    return { success: false, error: errorMessage };
  }
};

// ==================== Worker Polling Loop ====================

/**
 * Starts the triage worker polling loop.
 *
 * Polls the incident triage queue for messages and processes each alert
 * through the full triage pipeline (dedup, severity, runbooks, correlation,
 * evidence aggregation, AI summarization).
 *
 * @param container - Fully-wired TriageContainer from composition root
 * @returns Control interface with stop() and getStats() methods
 */
export const startTriageWorker = (container: TriageContainer): TriageWorkerControl => {
  const state: TriageWorkerState = {
    running: true,
    totalProcessed: 0,
    totalErrors: 0,
    totalDeduped: 0,
  };

  const pollLoop = async (): Promise<void> => {
    while (state.running) {
      try {
        await container.queue.process<{
          readonly alertId: string;
          readonly tenantId: string | null;
        }>(async (message) => handleQueueMessage(container, message, state));
      } catch (error) {
        logger.error("Triage worker poll error", {
          error: getErrorMessage(error),
        });
      }

      const pollDelay = state.running ? TRIAGE_WORKER_DEFAULTS.POLL_INTERVAL_MS : 0;

      if (pollDelay > 0) {
        await delay(pollDelay);
      }
    }
  };

  // Start the polling loop (fire-and-forget)
  void pollLoop();

  logger.info("Triage worker started", {
    pollIntervalMs: TRIAGE_WORKER_DEFAULTS.POLL_INTERVAL_MS,
  });

  return {
    stop: (): void => {
      stopWorker(state);
      logger.info("Triage worker stopping", {
        totalProcessed: state.totalProcessed,
        totalErrors: state.totalErrors,
        totalDeduped: state.totalDeduped,
      });
    },
    getStats: (): TriageWorkerStats => createStatsSnapshot(state),
  };
};
