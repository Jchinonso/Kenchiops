/**
 * Vercel Log Adapter
 *
 * Implements DeployLogSourcePort for Vercel. Handles:
 * - Webhook parsing for deployment events (deployment.error, deployment.ready)
 * - Log fetching via Vercel Deployment Events REST API
 * - Log drain batch parsing (NDJSON)
 *
 * Vendor types (VercelWebhookPayload, etc.) never cross this boundary.
 *
 * @module adapters/vercelLogAdapter
 */

import crypto from "crypto";
import {
  createLogger,
  getErrorMessage,
  ExternalServiceError,
  resilientGet,
  redactSecrets,
  VERCEL_API_BASE_URL,
  VERCEL_SIGNATURE,
  VERCEL_DEPLOYMENT_EVENTS,
  VERCEL_FAILURE_EVENTS,
  LOG_DRAIN_LIMITS,
  type RequestContext,
  type DeployLogSourcePort,
  type DeployWebhookResult,
  type FetchDeployLogsParams,
  type DeployLogData,
  type LogDrainBatchResult,
  type LogLine,
  type DeployMetadata,
  type DeployStatus,
} from "@kenchi/shared";
import type {
  VercelWebhookPayload,
  VercelDeploymentEventsResponse,
  VercelLogDrainLine,
} from "./vercelLogAdapterTypes.js";

const logger = createLogger("vercel-log-adapter");

const PROVIDER = "vercel" as const;
const VERCEL_TIMEOUT_MS = 30_000;
const VERCEL_MAX_RETRIES = 2;

// ==================== Signature Verification ====================

/**
 * Verifies the Vercel webhook signature (HMAC-SHA1).
 * Must be called before processing any webhook payload.
 */
export const verifyVercelSignature = (
  rawBody: Buffer,
  signature: string,
  secret: string
): boolean => {
  if (!signature) {
    return false;
  }

  const computed = crypto
    .createHmac(VERCEL_SIGNATURE.ALGORITHM, secret)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(computed, "hex"));
  } catch {
    return false;
  }
};

// ==================== Payload Guards ====================

const isVercelWebhookPayload = (payload: unknown): payload is VercelWebhookPayload =>
  typeof payload === "object" &&
  payload !== null &&
  "type" in payload &&
  "payload" in payload &&
  typeof (payload as VercelWebhookPayload).payload?.deployment?.id === "string";

// ==================== Mapping Helpers ====================

const mapReadyStateToStatus = (readyState: string, eventType: string): DeployStatus => {
  if (VERCEL_FAILURE_EVENTS.has(eventType)) {
    return "failed";
  }

  const statusMap: Readonly<Record<string, DeployStatus>> = {
    BUILDING: "building",
    DEPLOYING: "deploying",
    READY: "success",
    ERROR: "failed",
    CANCELED: "cancelled",
  };

  return statusMap[readyState] ?? "building";
};

const mapEventTypeToDeployEvent = (type: string): DeployWebhookResult["eventType"] => {
  if (type === VERCEL_DEPLOYMENT_EVENTS.ERROR || type === VERCEL_DEPLOYMENT_EVENTS.CANCELED) {
    return "deploy_failed";
  }
  if (type === VERCEL_DEPLOYMENT_EVENTS.READY || type === VERCEL_DEPLOYMENT_EVENTS.SUCCEEDED) {
    return "deploy_completed";
  }
  if (type === VERCEL_DEPLOYMENT_EVENTS.CREATED) {
    return "deploy_started";
  }
  return "deploy_started";
};

/** Safely reads a key from the deployment meta record. */
const getMetaValue = (
  meta: Readonly<Record<string, string>> | undefined,
  key: string
): string | undefined => meta?.[key];

const buildMetadata = (
  deployment: VercelWebhookPayload["payload"]["deployment"],
  eventType: string
): DeployMetadata => ({
  repository:
    getMetaValue(deployment.meta, "githubRepo") ??
    getMetaValue(deployment.meta, "gitlabProjectPath") ??
    deployment.name,
  branch: deployment.gitSource?.ref ?? "main",
  commit: deployment.gitSource?.sha ?? "",
  startedAt: new Date(deployment.createdAt),
  completedAt: deployment.ready ? new Date(deployment.ready) : null,
  status: mapReadyStateToStatus(deployment.readyState, eventType),
  projectId: deployment.projectId,
  projectName: deployment.name,
});

// ==================== Port Implementation ====================

const handleWebhook = async (
  payload: unknown,
  context: RequestContext
): Promise<DeployWebhookResult | null> => {
  if (!isVercelWebhookPayload(payload)) {
    logger.warn("Skipping non-deployment Vercel webhook", {
      provider: PROVIDER,
      operation: "handleWebhook",
      ...context,
    });
    return null;
  }

  const { deployment } = payload.payload;
  const eventType = payload.type;

  logger.info("Processing Vercel deployment webhook", {
    provider: PROVIDER,
    operation: "handleWebhook",
    deploymentId: deployment.id,
    eventType,
    readyState: deployment.readyState,
    ...context,
  });

  return {
    entityId: deployment.id,
    platform: PROVIDER,
    eventType: mapEventTypeToDeployEvent(eventType),
    metadata: buildMetadata(deployment, eventType),
    logs: null,
  };
};

const fetchDeployLogs = async (
  params: FetchDeployLogsParams,
  context: RequestContext
): Promise<DeployLogData> => {
  const startTime = Date.now();
  const url = `${VERCEL_API_BASE_URL}/v1/deployments/${encodeURIComponent(params.entityId)}/events`;
  const queryParams = params.teamId ? `?teamId=${encodeURIComponent(params.teamId)}` : "";

  try {
    const response = await resilientGet<VercelDeploymentEventsResponse>(`${url}${queryParams}`, {
      timeout: VERCEL_TIMEOUT_MS,
      maxRetries: VERCEL_MAX_RETRIES,
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
      },
    });

    const events = response.data.events ?? [];
    const logLines = events
      .filter((event) => event.text || event.payload?.text)
      .map((event) => event.text || event.payload?.text || "");
    const rawLog = logLines.join("\n");

    const durationMs = Date.now() - startTime;
    logger.info("Fetched Vercel deployment logs", {
      provider: PROVIDER,
      operation: "fetchDeployLogs",
      durationMs,
      statusCode: response.status,
      deploymentId: params.entityId,
      totalEvents: events.length,
      logLineCount: logLines.length,
      ...context,
    });

    return {
      entityId: params.entityId,
      rawLog,
      totalLines: logLines.length,
      isTruncated: false,
    };
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;
    const statusCode = (error as { status?: number }).status;
    const isRetryable = statusCode === undefined || statusCode >= 500 || statusCode === 429;

    logger.error("Failed to fetch Vercel deployment logs", {
      provider: PROVIDER,
      operation: "fetchDeployLogs",
      durationMs,
      statusCode,
      category: isRetryable ? "retryable" : "non_retryable",
      retryable: isRetryable,
      deploymentId: params.entityId,
      error: redactSecrets(getErrorMessage(error)),
      ...context,
    });

    throw new ExternalServiceError(PROVIDER, "Failed to fetch deployment logs", {
      metadata: {
        operation: "fetchDeployLogs",
        deploymentId: params.entityId,
        statusCode,
        durationMs,
      },
      retryable: isRetryable,
    });
  }
};

const parseLogDrainBatch = async (
  payload: unknown,
  context: RequestContext
): Promise<LogDrainBatchResult> => {
  const emptyResult: LogDrainBatchResult = {
    entityId: "",
    lines: [],
    platform: PROVIDER,
  };

  if (!Array.isArray(payload) || payload.length === 0) {
    if (!Array.isArray(payload)) {
      logger.warn("Invalid Vercel log drain payload — expected array", {
        provider: PROVIDER,
        operation: "parseLogDrainBatch",
        payloadType: typeof payload,
        ...context,
      });
    }
    return emptyResult;
  }

  // Validate first element has expected shape before casting
  const firstElement = payload[0] as Record<string, unknown>;
  if (typeof firstElement.message !== "string" || typeof firstElement.timestamp !== "number") {
    logger.warn("Invalid Vercel log drain line shape — missing message or timestamp", {
      provider: PROVIDER,
      operation: "parseLogDrainBatch",
      hasMessage: typeof firstElement.message,
      hasTimestamp: typeof firstElement.timestamp,
      ...context,
    });
    return emptyResult;
  }

  const allLines = payload as readonly VercelLogDrainLine[];
  const cappedLines =
    allLines.length > LOG_DRAIN_LIMITS.MAX_LINES_PER_BATCH
      ? allLines.slice(0, LOG_DRAIN_LIMITS.MAX_LINES_PER_BATCH)
      : allLines;
  const entityId = cappedLines[0].deploymentId ?? "";

  if (allLines.length > LOG_DRAIN_LIMITS.MAX_LINES_PER_BATCH) {
    logger.warn("Vercel log drain batch truncated to safety limit", {
      provider: PROVIDER,
      operation: "parseLogDrainBatch",
      originalCount: allLines.length,
      cappedAt: LOG_DRAIN_LIMITS.MAX_LINES_PER_BATCH,
      ...context,
    });
  }

  const lines: readonly LogLine[] = cappedLines.map((line) => ({
    timestamp: new Date(line.timestamp),
    message: line.message,
    level: line.level ?? "info",
    source: line.source ?? "build",
  }));

  logger.info("Parsed Vercel log drain batch", {
    provider: PROVIDER,
    operation: "parseLogDrainBatch",
    entityId,
    lineCount: lines.length,
    ...context,
  });

  return { entityId, lines, platform: PROVIDER };
};

// ==================== Adapter Export ====================

/**
 * Vercel log source adapter implementing DeployLogSourcePort.
 */
export const vercelLogAdapter: DeployLogSourcePort = {
  verifySignature: verifyVercelSignature,
  handleWebhook,
  fetchDeployLogs,
  parseLogDrainBatch,
};
