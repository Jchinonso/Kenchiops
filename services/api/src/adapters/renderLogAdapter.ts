/**
 * Render Log Adapter
 *
 * Implements DeployLogSourcePort for Render. Handles:
 * - Webhook parsing for deploy status events
 * - Log fetching via Render REST API (pull-based)
 * - No log drain support (Render is pull-only)
 *
 * @module adapters/renderLogAdapter
 */

import crypto from "crypto";
import {
  createLogger,
  getErrorMessage,
  ExternalServiceError,
  resilientGet,
  redactSecrets,
  type RequestContext,
  type DeployLogSourcePort,
  type DeployWebhookResult,
  type FetchDeployLogsParams,
  type DeployLogData,
  type LogDrainBatchResult,
  type DeployMetadata,
  type DeployStatus,
} from "@kenchi/shared";
import type { RenderWebhookPayload, RenderLogsResponse } from "./renderLogAdapterTypes.js";

const logger = createLogger("render-log-adapter");

const PROVIDER = "render" as const;
const RENDER_API_URL = "https://api.render.com";
const RENDER_TIMEOUT_MS = 30_000;
const RENDER_MAX_RETRIES = 2;
const RENDER_SIGNATURE_ALGORITHM = "sha256";

// ==================== Signature Verification ====================

const verifyRenderSignature = (rawBody: Buffer, signature: string, secret: string): boolean => {
  if (!signature) {
    return false;
  }

  const computed = crypto
    .createHmac(RENDER_SIGNATURE_ALGORITHM, secret)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(computed, "hex"));
  } catch {
    return false;
  }
};

// ==================== Payload Guards ====================

const isRenderWebhookPayload = (payload: unknown): payload is RenderWebhookPayload =>
  typeof payload === "object" &&
  payload !== null &&
  "type" in payload &&
  "data" in payload &&
  typeof (payload as RenderWebhookPayload).data?.id === "string";

// ==================== Mapping Helpers ====================

const mapStatusToDeployStatus = (status: string): DeployStatus => {
  const statusMap: Readonly<Record<string, DeployStatus>> = {
    build_in_progress: "building",
    update_in_progress: "deploying",
    live: "success",
    build_failed: "failed",
    update_failed: "failed",
    canceled: "cancelled",
    deactivated: "cancelled",
  };
  return statusMap[status] ?? "building";
};

const mapTypeToEventType = (type: string, status: string): DeployWebhookResult["eventType"] => {
  const failureStatuses = new Set(["build_failed", "update_failed"]);
  const successStatuses = new Set(["live"]);

  if (failureStatuses.has(status)) {
    return "deploy_failed";
  }
  if (successStatuses.has(status)) {
    return "deploy_completed";
  }
  if (type === "deploy_started" || type === "build_started") {
    return "deploy_started";
  }
  return "deploy_started";
};

const buildMetadata = (payload: RenderWebhookPayload): DeployMetadata => ({
  repository: payload.data.serviceName,
  branch: payload.data.branch ?? "main",
  commit: payload.data.commit?.id ?? "",
  startedAt: new Date(payload.data.createdAt),
  completedAt: payload.data.finishedAt ? new Date(payload.data.finishedAt) : null,
  status: mapStatusToDeployStatus(payload.data.status),
  projectId: payload.data.serviceId,
  projectName: payload.data.serviceName,
});

// ==================== Port Implementation ====================

const handleWebhook = async (
  payload: unknown,
  context: RequestContext
): Promise<DeployWebhookResult | null> => {
  const logContext = { ...context };

  if (!isRenderWebhookPayload(payload)) {
    logger.warn("Skipping non-deployment Render webhook", {
      provider: PROVIDER,
      operation: "handleWebhook",
      ...logContext,
    });
    return null;
  }

  logger.info("Processing Render deployment webhook", {
    provider: PROVIDER,
    operation: "handleWebhook",
    deploymentId: payload.data.id,
    status: payload.data.status,
    ...logContext,
  });

  return {
    entityId: payload.data.id,
    platform: PROVIDER,
    eventType: mapTypeToEventType(payload.type, payload.data.status),
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

  // Render logs are per-service, not per-deploy. Use time range if available.
  const queryParams = params.timeRange
    ? `?start=${params.timeRange.start.toISOString()}&end=${params.timeRange.end.toISOString()}`
    : "";
  const url = `${RENDER_API_URL}/v1/services/${encodeURIComponent(params.entityId)}/logs${queryParams}`;

  try {
    const response = await resilientGet<RenderLogsResponse>(url, {
      timeout: RENDER_TIMEOUT_MS,
      maxRetries: RENDER_MAX_RETRIES,
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        Accept: "application/json",
      },
    });

    const entries = response.data.logs ?? [];
    const rawLog = entries
      .map((entry) => `[${entry.level}] ${entry.timestamp} ${entry.message}`)
      .join("\n");

    const durationMs = Date.now() - startTime;
    logger.info("Fetched Render deployment logs", {
      provider: PROVIDER,
      operation: "fetchDeployLogs",
      durationMs,
      statusCode: response.status,
      entityId: params.entityId,
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

    logger.error("Failed to fetch Render deployment logs", {
      provider: PROVIDER,
      operation: "fetchDeployLogs",
      durationMs,
      statusCode,
      category: isRetryable ? "retryable" : "non_retryable",
      entityId: params.entityId,
      error: redactSecrets(getErrorMessage(error)),
      ...logContext,
    });

    throw new ExternalServiceError(PROVIDER, "Failed to fetch deployment logs", {
      metadata: { operation: "fetchDeployLogs", entityId: params.entityId, statusCode, durationMs },
      retryable: isRetryable,
    });
  }
};

/** Render does not support log drains. Returns empty result. */
const parseLogDrainBatch = async (
  _payload: unknown,
  _context: RequestContext
): Promise<LogDrainBatchResult> => ({
  entityId: "",
  lines: [],
  platform: PROVIDER,
});

// ==================== Adapter Export ====================

export const renderLogAdapter: DeployLogSourcePort = {
  verifySignature: verifyRenderSignature,
  handleWebhook,
  fetchDeployLogs,
  parseLogDrainBatch,
};
