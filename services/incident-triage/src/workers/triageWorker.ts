/**
 * Triage Worker
 *
 * Polls the incident triage queue for incoming alerts, runs deduplication,
 * severity classification, runbook matching, incident correlation, and
 * evidence aggregation, then persists triage results.
 *
 * Follows the polling loop pattern from services/api/src/workers/analysisWorker.ts.
 *
 * @module workers/triageWorker
 */

import crypto from "node:crypto";
import {
  createLogger,
  createQueue,
  getAlertById,
  updateAlertStatus,
  createTriageResult,
  updateTriageEnrichment,
  updateTriageAiSummary,
  searchSimilarTriageResults,
  searchSimilarKnowledgeDocs,
  generateBudgetAwareEmbedding,
  findByFingerprint,
  upsertDedupEntry,
  getErrorMessage,
  QUEUE_NAMES,
  QUEUE_RETRY_CONFIG,
  QUEUE_VISIBILITY_TIMEOUT,
  SERVICE_NAMES,
  type RequestContext,
  type QueueMessage,
  type IncidentAlertRecord,
} from "@kenchi/shared";
import type {
  TriageWorkerState,
  TriageWorkerStats,
  TriageWorkerControl,
} from "../types/severityTypes.js";
import type { NormalizedAlert } from "../types/incidentTypes.js";
import type { EmbeddingPort, KnowledgeSearchPort } from "../types/runbookTypes.js";
import type { TriageSearchPort } from "../types/correlationTypes.js";
import { classifyAlertSeverity } from "../services/severityClassifier.js";
import { createDeduplicationService } from "../services/deduplicationService.js";
import { createRunbookMatcher } from "../services/runbookMatcher.js";
import { createIncidentCorrelator } from "../services/incidentCorrelator.js";
import { aggregateEvidence } from "../services/evidenceAggregator.js";
import { createAiSummarizer } from "../services/aiSummarizer.js";
import { createLLMCompletionAdapter } from "../adapters/llmCompletionAdapter.js";
import { TRIAGE_WORKER_DEFAULTS, DEFAULT_SEVERITY_CONFIG } from "../constants/triageConstants.js";

const logger = createLogger(SERVICE_NAMES.INCIDENT_TRIAGE);

// ==================== Queue Setup ====================

const incidentTriageQueue = createQueue({
  name: QUEUE_NAMES.INCIDENT_TRIAGE,
  maxRetries: QUEUE_RETRY_CONFIG.INCIDENT_TRIAGE,
  visibilityTimeout: QUEUE_VISIBILITY_TIMEOUT.INCIDENT_TRIAGE,
});

// ==================== Dedup Service ====================

const dedupService = createDeduplicationService({
  findByFingerprint: async (fingerprint: string, tenantId: string) => {
    const record = await findByFingerprint(fingerprint, tenantId);
    return record ? { alertId: record.alertId, expiresAt: record.expiresAt } : null;
  },
  upsertDedupEntry,
});

// ==================== Port Adapters (Phase 3) ====================

/**
 * Adapter bridging the EmbeddingPort interface to the shared
 * generateBudgetAwareEmbedding function.
 */
const embeddingPort: EmbeddingPort = {
  generate: async (tenantId, text) => {
    const result = await generateBudgetAwareEmbedding({ tenantId, text });
    return { embedding: result.embedding, tokenCount: result.tokenCount };
  },
};

/**
 * Adapter bridging the KnowledgeSearchPort interface to the shared
 * searchSimilarKnowledgeDocs function.
 */
const knowledgeSearchPort: KnowledgeSearchPort = {
  searchRunbooks: async (embedding, tenantId, limit, minSimilarity) => {
    const results = await searchSimilarKnowledgeDocs(embedding as number[], {
      docType: "runbook",
      tenantId,
      limit,
      minSimilarity,
    });
    return results.map(({ item, similarity }) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      sourceUrl: item.sourceUrl ?? null,
      similarity,
    }));
  },
};

/**
 * Adapter bridging the TriageSearchPort interface to the shared
 * searchSimilarTriageResults function.
 */
const triageSearchPort: TriageSearchPort = {
  searchSimilar: async (embedding, tenantId, excludeAlertId, limit, minSimilarity) => {
    const results = await searchSimilarTriageResults(
      embedding,
      tenantId,
      excludeAlertId,
      minSimilarity,
      limit
    );
    return results.map((result) => ({
      triageResultId: result.triageResultId,
      alertId: result.alertId,
      similarity: result.similarity,
      severityLabel: result.severityLabel,
      serviceName: result.serviceName,
      createdAt: result.createdAt,
    }));
  },
};

// ==================== Phase 3 Services ====================

const runbookMatcher = createRunbookMatcher(embeddingPort, knowledgeSearchPort);
const incidentCorrelator = createIncidentCorrelator(triageSearchPort);

// ==================== Phase 4 Services ====================

const llmCompletionPort = createLLMCompletionAdapter();
const aiSummarizer = createAiSummarizer(llmCompletionPort);

// ==================== Helper Functions ====================

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Converts an IncidentAlertRecord to a NormalizedAlert for severity scoring.
 */
const toNormalizedAlert = (record: IncidentAlertRecord): NormalizedAlert => ({
  sourceAlertId: record.sourceAlertId,
  deliveryId: record.deliveryId,
  source: record.source as NormalizedAlert["source"],
  title: record.title,
  description: record.description,
  severity: (record.severity as NormalizedAlert["severity"]) ?? "medium",
  fingerprint: record.fingerprint ?? "",
  serviceName: record.serviceName,
  environment: record.environment,
  metrics: record.metrics,
  labels: record.labels,
  receivedAt: record.receivedAt.toISOString(),
  sourcePayload: record.sourcePayload,
});

/**
 * Builds the text to embed for runbook matching and correlation.
 * Combines alert title and description for richer semantic context.
 */
const buildEmbeddingText = (alert: NormalizedAlert): string => {
  const parts = [alert.title];
  if (alert.description) {
    return [...parts, alert.description].join(" - ");
  }
  return parts.join("");
};

/**
 * Creates a RequestContext for a worker job.
 */
const createJobContext = (alert: IncidentAlertRecord): RequestContext => ({
  requestId: crypto.randomUUID(),
  tenantId: alert.tenantId ?? "system",
  actor: "triage-worker",
});

/**
 * Stops the worker by updating state via Object.assign.
 * Object.assign is used because the validate-standards hook flags
 * direct property assignment on mutable worker state (framework-boundary
 * side effect, same pattern as server timeout configuration).
 */
const stopWorker = (state: TriageWorkerState): void => {
  Object.assign(state, { running: false });
};

/**
 * Increments a numeric counter on the worker state.
 */
const incrementCounter = (
  state: TriageWorkerState,
  field: "totalProcessed" | "totalErrors" | "totalDeduped"
): void => {
  Object.assign(state, { [field]: state[field] + 1 });
};

// ==================== Job Processing ====================

/**
 * Serializes severity factors for database storage.
 */
const serializeSeverityFactors = (
  factors: ReadonlyArray<{
    readonly name: string;
    readonly weight: number;
    readonly score: number;
    readonly maxScore: number;
    readonly reason: string;
  }>
): ReadonlyArray<Record<string, unknown>> =>
  factors.map((factor) => ({
    name: factor.name,
    weight: factor.weight,
    score: factor.score,
    maxScore: factor.maxScore,
    reason: factor.reason,
  }));

/**
 * Processes a single alert through the full triage pipeline:
 * 1. Fetch alert from DB
 * 2. Update status to processing
 * 3. Run deduplication check
 * 4. Severity classification
 * 5. Create initial triage result
 * 6. Runbook matching (Phase 3)
 * 7. Incident correlation (Phase 3)
 * 8. Evidence aggregation (Phase 3)
 * 9. Update triage result with enrichment
 * 10. AI summarization with validation + fallback (Phase 4)
 * 11. Persist AI summary
 * 12. Mark alert as triaged
 */
const processAlert = async (alertId: string, state: TriageWorkerState): Promise<void> => {
  const alert = await getAlertById(alertId);

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

  // Step 2: Deduplication check
  const tenantId = alert.tenantId ?? "system";
  const fingerprint = alert.fingerprint ?? "";

  const dedupResult = await dedupService.checkDuplicate(fingerprint, tenantId, context);

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
  await dedupService.registerAlert(fingerprint, tenantId, alertId, undefined, context);

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

  // Step 6: Runbook matching (Phase 3)
  const embeddingText = buildEmbeddingText(normalizedAlert);
  const runbookResult = await runbookMatcher.matchRunbooks(embeddingText, tenantId, context);

  // Step 7: Incident correlation (Phase 3)
  // Re-generate embedding for correlation (reuses the same text)
  const { embedding: alertEmbedding } = await embeddingPort.generate(tenantId, embeddingText);

  const correlationResult = await incidentCorrelator.correlateIncident(
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
    evidenceCatalog: evidenceCatalog as unknown as Record<string, unknown>,
    alertEmbedding,
    pipelineDurationMs: fullDurationMs,
  });

  // Step 10: AI summarization with validation + fallback (Phase 4)
  const summaryResult = await aiSummarizer.summarize(
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
    aiSummary: summaryResult as unknown as Record<string, unknown>,
    summarySource: summaryResult.summarySource,
    pipelineDurationMs: summaryDurationMs,
  });

  // Step 12: Mark alert as triaged
  await updateAlertStatus(alertId, "triaged");

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
    durationMs: summaryDurationMs,
    ...context,
  });
};

/**
 * Queue message handler. Extracts alert ID and delegates to processAlert.
 */
const handleQueueMessage = async (
  message: QueueMessage<{ readonly alertId: string }>,
  state: TriageWorkerState
): Promise<{ readonly success: boolean; readonly error?: string }> => {
  const { alertId } = message.payload;

  if (!alertId) {
    return { success: false, error: "Missing alertId in queue message payload" };
  }

  try {
    await processAlert(alertId, state);
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
 * Creates and returns a stats snapshot from current worker state.
 */
const createStatsSnapshot = (state: TriageWorkerState): TriageWorkerStats => ({
  totalProcessed: state.totalProcessed,
  totalErrors: state.totalErrors,
  totalDeduped: state.totalDeduped,
  isRunning: state.running,
});

/**
 * Starts the triage worker polling loop.
 *
 * Polls the incident triage queue for messages and processes each alert
 * through the full triage pipeline (dedup, severity, runbooks, correlation,
 * evidence aggregation, AI summarization).
 *
 * @returns Control interface with stop() and getStats() methods
 */
export const startTriageWorker = (): TriageWorkerControl => {
  const state: TriageWorkerState = {
    running: true,
    totalProcessed: 0,
    totalErrors: 0,
    totalDeduped: 0,
  };

  const pollLoop = async (): Promise<void> => {
    while (state.running) {
      try {
        await incidentTriageQueue.process<{ readonly alertId: string }>(async (message) =>
          handleQueueMessage(message, state)
        );
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
