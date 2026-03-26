/**
 * Netlify Log Adapter
 *
 * Implements DeployLogSourcePort for Netlify. Handles:
 * - Webhook parsing for deploy notifications (deploy_failed, deploy_building)
 * - Log fetching via Netlify REST API
 * - Log drain batch parsing (JSON array)
 *
 * @module adapters/netlifyLogAdapter
 */

import crypto from "crypto";
import {
  createLogger,
  getErrorMessage,
  ExternalServiceError,
  resilientGet,
  redactSecrets,
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
  NetlifyWebhookPayload,
  NetlifyDeployLogResponse,
  NetlifyLogDrainLine,
} from "./netlifyLogAdapterTypes.js";

const logger = createLogger("netlify-log-adapter");

const PROVIDER = "netlify" as const;
const NETLIFY_API_URL = "https://api.netlify.com";
const NETLIFY_TIMEOUT_MS = 30_000;
const NETLIFY_MAX_RETRIES = 2;
const NETLIFY_SIGNATURE_ALGORITHM = "sha256";

// ==================== Signature Verification ====================

const verifyNetlifySignature = (rawBody: Buffer, signature: string, secret: string): boolean => {
  if (!signature) {
    return false;
  }

  const computed = crypto
    .createHmac(NETLIFY_SIGNATURE_ALGORITHM, secret)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(computed, "hex"));
  } catch {
    return false;
  }
};

// ==================== Payload Guards ====================

const isNetlifyWebhookPayload = (payload: unknown): payload is NetlifyWebhookPayload =>
  typeof payload === "object" &&
  payload !== null &&
  "id" in payload &&
  "state" in payload &&
  "site_id" in payload &&
  typeof (payload as NetlifyWebhookPayload).id === "string";

// ==================== Mapping Helpers ====================

const mapStateToDeployStatus = (state: string): DeployStatus => {
  const statusMap: Readonly<Record<string, DeployStatus>> = {
    building: "building",
    deploying: "deploying",
    ready: "success",
    error: "failed",
    cancelled: "cancelled",
  };
  return statusMap[state] ?? "building";
};

const mapStateToEventType = (state: string): DeployWebhookResult["eventType"] => {
  if (state === "error") {
    return "deploy_failed";
  }
  if (state === "ready") {
    return "deploy_completed";
  }
  return "deploy_started";
};

const buildMetadata = (payload: NetlifyWebhookPayload): DeployMetadata => ({
  repository: payload.name,
  branch: payload.branch ?? "main",
  commit: payload.commit_ref ?? "",
  startedAt: new Date(payload.created_at),
  completedAt: payload.updated_at !== payload.created_at ? new Date(payload.updated_at) : null,
  status: mapStateToDeployStatus(payload.state),
  projectId: payload.site_id,
  projectName: payload.name,
});

// ==================== Port Implementation ====================

const handleWebhook = async (
  payload: unknown,
  context: RequestContext
): Promise<DeployWebhookResult | null> => {
  const logContext = { ...context };

  if (!isNetlifyWebhookPayload(payload)) {
    logger.warn("Skipping non-deployment Netlify webhook", {
      provider: PROVIDER,
      operation: "handleWebhook",
      ...logContext,
    });
    return null;
  }

  logger.info("Processing Netlify deployment webhook", {
    provider: PROVIDER,
    operation: "handleWebhook",
    deploymentId: payload.id,
    state: payload.state,
    ...logContext,
  });

  return {
    entityId: payload.id,
    platform: PROVIDER,
    eventType: mapStateToEventType(payload.state),
    metadata: buildMetadata(payload),
    logs: null,
  };
};

const fetchDeployLogs = async (
  params: FetchDeployLogsParams,
  context: RequestContext
): Promise<DeployLogData> => {
  const logContext = { ...context };
  const startTime = Date.now();
  const url = `${NETLIFY_API_URL}/api/v1/deploys/${encodeURIComponent(params.entityId)}/log`;

  try {
    const response = await resilientGet<NetlifyDeployLogResponse>(url, {
      timeout: NETLIFY_TIMEOUT_MS,
      maxRetries: NETLIFY_MAX_RETRIES,
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
      },
    });

    const entries = response.data.log ?? [];
    const rawLog = entries.map((entry) => `[${entry.section}] ${entry.msg}`).join("\n");

    const durationMs = Date.now() - startTime;
    logger.info("Fetched Netlify deployment logs", {
      provider: PROVIDER,
      operation: "fetchDeployLogs",
      durationMs,
      statusCode: response.status,
      deploymentId: params.entityId,
      logLineCount: entries.length,
      ...logContext,
    });

    return {
      entityId: params.entityId,
      rawLog,
      totalLines: entries.length,
      isTruncated: false,
    };
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;
    const statusCode = (error as { status?: number }).status;
    const isRetryable = statusCode === undefined || statusCode >= 500 || statusCode === 429;

    logger.error("Failed to fetch Netlify deployment logs", {
      provider: PROVIDER,
      operation: "fetchDeployLogs",
      durationMs,
      statusCode,
      category: isRetryable ? "retryable" : "non_retryable",
      deploymentId: params.entityId,
      error: redactSecrets(getErrorMessage(error)),
      ...logContext,
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
  const logContext = { ...context };
  const emptyResult: LogDrainBatchResult = { entityId: "", lines: [], platform: PROVIDER };

  if (!Array.isArray(payload) || payload.length === 0) {
    if (!Array.isArray(payload)) {
      logger.warn("Invalid Netlify log drain payload — expected array", {
        provider: PROVIDER,
        operation: "parseLogDrainBatch",
        payloadType: typeof payload,
        ...logContext,
      });
    }
    return emptyResult;
  }

  // Validate first element shape
  const firstElement = payload[0] as Record<string, unknown>;
  if (typeof firstElement.message !== "string" || typeof firstElement.timestamp !== "number") {
    logger.warn("Invalid Netlify log drain line shape", {
      provider: PROVIDER,
      operation: "parseLogDrainBatch",
      hasMessage: typeof firstElement.message,
      hasTimestamp: typeof firstElement.timestamp,
      ...logContext,
    });
    return emptyResult;
  }

  const allLines = payload as readonly NetlifyLogDrainLine[];
  const cappedLines =
    allLines.length > LOG_DRAIN_LIMITS.MAX_LINES_PER_BATCH
      ? allLines.slice(0, LOG_DRAIN_LIMITS.MAX_LINES_PER_BATCH)
      : allLines;
  const entityId = cappedLines[0].deploy_id ?? "";

  if (allLines.length > LOG_DRAIN_LIMITS.MAX_LINES_PER_BATCH) {
    logger.warn("Netlify log drain batch truncated to safety limit", {
      provider: PROVIDER,
      operation: "parseLogDrainBatch",
      originalCount: allLines.length,
      cappedAt: LOG_DRAIN_LIMITS.MAX_LINES_PER_BATCH,
      ...logContext,
    });
  }

  const lines: readonly LogLine[] = cappedLines.map((line) => ({
    timestamp: new Date(line.timestamp),
    message: line.message,
    level: line.level ?? "info",
    source: line.source ?? "build",
  }));

  logger.info("Parsed Netlify log drain batch", {
    provider: PROVIDER,
    operation: "parseLogDrainBatch",
    entityId,
    lineCount: lines.length,
    ...logContext,
  });

  return { entityId, lines, platform: PROVIDER };
};

// ==================== Adapter Export ====================

export const netlifyLogAdapter: DeployLogSourcePort = {
  verifySignature: verifyNetlifySignature,
  handleWebhook,
  fetchDeployLogs,
  parseLogDrainBatch,
};
