/**
 * Deploy Analysis Service
 *
 * Orchestrates deployment log analysis for platforms like Vercel, Railway,
 * Render, and Netlify. Routes completed deploys through the existing
 * analysis pipeline. Routes continuous/in-progress deploys through
 * the ingestion buffer → windowed analysis flow.
 *
 * @module services/deployAnalysisService
 */

import {
  createLogger,
  checkAlertAnalysisQuota,
  incrementAlertAnalysisCount,
  type RequestContext,
  type DeployLogSourcePort,
  type DeployPlatform,
  type DeployMetadata,
  type IngestionBufferPort,
  type FlushResult,
} from "@kenchi/shared";
import type { AnalyzeRequest } from "../types/apiTypes.js";
import type {
  ProcessWebhookResult,
  ProcessLogDrainResult,
  DeployAnalysisServiceDeps,
  DeployEntityContext,
} from "./deployAnalysisTypes.js";
import { processWindow } from "./windowedAnalysis.js";

const logger = createLogger("deploy-analysis");

// ==================== Mapping Helpers ====================

/**
 * Maps deploy metadata + raw log to the existing AnalyzeRequest format.
 */
const mapToAnalyzeRequest = (
  rawLog: string,
  metadata: DeployMetadata,
  platform: DeployPlatform,
  tenantId: string
): AnalyzeRequest => ({
  failure_log: rawLog,
  repository: metadata.repository,
  commit: metadata.commit || undefined,
  tenant_id: tenantId,
  ci_provider: platform,
  branch: metadata.branch,
});

/**
 * Flushes the buffer and runs windowed analysis.
 * Shared by processLogDrainBatch and forceFlush.
 */
const flushAndAnalyze = async (
  buffer: IngestionBufferPort,
  flushResult: FlushResult,
  entity: DeployEntityContext,
  context: RequestContext
): Promise<ProcessLogDrainResult> => {
  if (flushResult.lineCount === 0) {
    return { entityId: entity.entityId, linesAccepted: 0, flushed: false, windowResult: null };
  }

  const windowResult = await processWindow(
    {
      entityId: entity.entityId,
      tenantId: entity.tenantId,
      platform: entity.platform,
      metadata: entity.metadata,
      lines: flushResult.lines,
      estimatedTokens: flushResult.estimatedTokens,
      windowNumber: flushResult.windowNumber,
      previousSummary: flushResult.previousSummary,
    },
    context
  );

  await buffer.updateSummary(entity.entityId, entity.tenantId, windowResult.updatedSummary);

  return { entityId: entity.entityId, linesAccepted: 0, flushed: true, windowResult };
};

// ==================== Standalone Operations ====================

/**
 * Processes a deployment webhook event.
 * Completed/failed deploys → fetch full logs → existing analysis pipeline.
 * In-progress deploys → skip (logs arrive via log drain).
 */
const handleDeployWebhook = async (
  deps: DeployAnalysisServiceDeps,
  buffer: IngestionBufferPort,
  adapter: DeployLogSourcePort,
  platform: DeployPlatform,
  payload: unknown,
  context: RequestContext
): Promise<ProcessWebhookResult> => {
  const logContext = { ...context };

  const webhookResult = await adapter.handleWebhook(payload, context);
  if (!webhookResult) {
    return { action: "skipped", reason: "Event not relevant for analysis" };
  }

  const { entityId, eventType, metadata } = webhookResult;

  if (eventType === "deploy_started") {
    logger.info("Deploy started — waiting for completion or log drain data", {
      provider: platform,
      operation: "processDeployWebhook",
      entityId,
      ...logContext,
    });
    return { action: "skipped", reason: "Deploy in progress — awaiting completion" };
  }

  if (eventType !== "deploy_failed" && eventType !== "deploy_completed") {
    return { action: "skipped", reason: `Unhandled event type: ${eventType}` };
  }

  // Enforce per-tenant analysis budget (fail-open, defaults to free plan if unknown)
  const quotaCheck = await checkAlertAnalysisQuota(context.tenantId, undefined, context);
  if (!quotaCheck.allowed) {
    logger.warn("Deploy analysis quota exceeded", {
      provider: platform,
      operation: "processDeployWebhook",
      durationMs: 0,
      entityId,
      reason: quotaCheck.reason,
      ...logContext,
    });
    return { action: "skipped", reason: quotaCheck.reason ?? "Analysis quota exceeded" };
  }

  logger.info("Fetching deploy logs for analysis", {
    provider: platform,
    operation: "processDeployWebhook",
    entityId,
    eventType,
    ...logContext,
  });

  const logData = await adapter.fetchDeployLogs(
    { entityId, platform, accessToken: "", teamId: undefined },
    context
  );

  if (!logData.rawLog || logData.rawLog.trim().length === 0) {
    logger.warn("Empty deploy logs — skipping analysis", {
      provider: platform,
      operation: "processDeployWebhook",
      entityId,
      ...logContext,
    });
    return { action: "skipped", reason: "Deploy logs are empty" };
  }

  const request = mapToAnalyzeRequest(logData.rawLog, metadata, platform, context.tenantId);
  const response = await deps.performAnalysis(request, context);

  // Track usage after successful analysis
  await incrementAlertAnalysisCount(context.tenantId, context);

  await buffer.close(entityId, context.tenantId, context);

  logger.info("Deploy analysis completed via full pipeline", {
    provider: platform,
    operation: "processDeployWebhook",
    entityId,
    confidence: response.confidence,
    ...logContext,
  });

  return { action: "analyzed", response };
};

/**
 * Processes a log drain batch (continuous logs).
 * Appends to buffer, runs windowed analysis if flush triggers are met.
 */
const handleLogDrainBatch = async (
  buffer: IngestionBufferPort,
  adapter: DeployLogSourcePort,
  platform: DeployPlatform,
  payload: unknown,
  entity: DeployEntityContext,
  context: RequestContext
): Promise<ProcessLogDrainResult> => {
  const logContext = { ...context };

  const batchResult = await adapter.parseLogDrainBatch(payload, context);
  if (batchResult.lines.length === 0) {
    return { entityId: "", linesAccepted: 0, flushed: false, windowResult: null };
  }

  const { entityId } = batchResult;
  const appendResult = await buffer.append(
    entityId,
    entity.tenantId,
    platform,
    batchResult.lines,
    context
  );
  const triggerResult = await buffer.checkFlushTriggers(entityId, entity.tenantId, platform);

  if (!triggerResult.shouldFlush) {
    return {
      entityId,
      linesAccepted: appendResult.linesAccepted,
      flushed: false,
      windowResult: null,
    };
  }

  logger.info("Flush trigger met — running windowed analysis", {
    provider: platform,
    operation: "processLogDrainBatch",
    entityId,
    triggerReason: triggerResult.reason,
    estimatedBufferTokens: triggerResult.estimatedBufferTokens,
    ...logContext,
  });

  const flushResult = await buffer.flush(entityId, entity.tenantId, context);
  return flushAndAnalyze(buffer, flushResult, { ...entity, entityId }, context);
};

// ==================== Service Interface ====================

/** Shape of the deploy analysis service. */
export interface DeployAnalysisService {
  readonly processDeployWebhook: (
    platform: DeployPlatform,
    payload: unknown,
    context: RequestContext
  ) => Promise<ProcessWebhookResult>;
  readonly processLogDrainBatch: (
    platform: DeployPlatform,
    payload: unknown,
    entity: DeployEntityContext,
    context: RequestContext
  ) => Promise<ProcessLogDrainResult>;
  readonly forceFlush: (
    entity: DeployEntityContext,
    context: RequestContext
  ) => Promise<ProcessLogDrainResult>;
}

/**
 * Creates the deploy analysis service by binding dependencies.
 */
export const createDeployAnalysisService = (
  deps: DeployAnalysisServiceDeps,
  buffer: IngestionBufferPort,
  adapters: Readonly<Record<DeployPlatform, DeployLogSourcePort>>
): DeployAnalysisService => ({
  processDeployWebhook: (platform, payload, context) =>
    handleDeployWebhook(deps, buffer, adapters[platform], platform, payload, context),

  processLogDrainBatch: (platform, payload, entity, context) =>
    handleLogDrainBatch(buffer, adapters[platform], platform, payload, entity, context),

  forceFlush: async (entity, context) => {
    const logContext = { ...context };
    logger.info("Force-flushing ingestion buffer", {
      provider: entity.platform,
      operation: "forceFlush",
      entityId: entity.entityId,
      ...logContext,
    });

    const flushResult = await buffer.flush(entity.entityId, entity.tenantId, context);
    return flushAndAnalyze(buffer, flushResult, entity, context);
  },
});
