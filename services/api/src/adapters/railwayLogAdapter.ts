/**
 * Railway Log Adapter
 *
 * Implements DeployLogSourcePort for Railway. Handles:
 * - Webhook parsing for deploy status changes
 * - Log fetching via Railway GraphQL API (poll-based, Phase 1)
 * - No log drain support (Railway uses subscriptions, deferred to Phase 2)
 *
 * @module adapters/railwayLogAdapter
 */

import crypto from "crypto";
import {
  createLogger,
  getErrorMessage,
  ExternalServiceError,
  resilientPost,
  redactSecrets,
  type RequestContext,
  type DeployLogSourcePort,
  type DeployWebhookResult,
  type FetchDeployLogsParams,
  type DeployLogData,
  type LogDrainBatchResult,
  type DeployMetadata,
  type DeployStatus,
  type LogLine,
} from "@kenchi/shared";
import type {
  RailwayWebhookPayload,
  RailwayDeploymentLogsResponse,
} from "./railwayLogAdapterTypes.js";
import { subscribeToRailwayLogs } from "./railwayStreamingAdapter.js";

const logger = createLogger("railway-log-adapter");

const PROVIDER = "railway" as const;
const RAILWAY_API_URL = "https://backboard.railway.app/graphql/v2";
const RAILWAY_TIMEOUT_MS = 30_000;
const RAILWAY_MAX_RETRIES = 2;
const RAILWAY_SIGNATURE_ALGORITHM = "sha256";

// ==================== Signature Verification ====================

const verifyRailwaySignature = (rawBody: Buffer, signature: string, secret: string): boolean => {
  if (!signature) {
    return false;
  }

  const computed = crypto
    .createHmac(RAILWAY_SIGNATURE_ALGORITHM, secret)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(computed, "hex"));
  } catch {
    return false;
  }
};

// ==================== Payload Guards ====================

const isRailwayWebhookPayload = (payload: unknown): payload is RailwayWebhookPayload =>
  typeof payload === "object" &&
  payload !== null &&
  "type" in payload &&
  "deployment" in payload &&
  typeof (payload as RailwayWebhookPayload).deployment?.id === "string";

// ==================== Mapping Helpers ====================

const mapStatusToDeployStatus = (status: string): DeployStatus => {
  const statusMap: Readonly<Record<string, DeployStatus>> = {
    BUILDING: "building",
    DEPLOYING: "deploying",
    SUCCESS: "success",
    FAILED: "failed",
    CRASHED: "failed",
    REMOVED: "cancelled",
  };
  return statusMap[status] ?? "building";
};

const mapTypeToEventType = (type: string): DeployWebhookResult["eventType"] => {
  const failureTypes = new Set(["DEPLOY_FAILED", "DEPLOY_CRASHED"]);
  const successTypes = new Set(["DEPLOY_COMPLETED", "DEPLOY_SUCCESS"]);

  if (failureTypes.has(type)) {
    return "deploy_failed";
  }
  if (successTypes.has(type)) {
    return "deploy_completed";
  }
  return "deploy_started";
};

const buildMetadata = (payload: RailwayWebhookPayload): DeployMetadata => ({
  repository: payload.deployment.meta?.repo ?? payload.project.name,
  branch: payload.deployment.meta?.branch ?? "main",
  commit: payload.deployment.meta?.commitSha ?? "",
  startedAt: new Date(payload.deployment.createdAt),
  completedAt:
    payload.deployment.updatedAt !== payload.deployment.createdAt
      ? new Date(payload.deployment.updatedAt)
      : null,
  status: mapStatusToDeployStatus(payload.deployment.status),
  projectId: payload.project.id,
  projectName: payload.project.name,
});

// ==================== GraphQL Query ====================

const DEPLOYMENT_LOGS_QUERY = `
  query deploymentLogs($deploymentId: String!) {
    deploymentLogs(deploymentId: $deploymentId) {
      timestamp
      message
      severity
    }
  }
`;

// ==================== Port Implementation ====================

const handleWebhook = async (
  payload: unknown,
  context: RequestContext
): Promise<DeployWebhookResult | null> => {
  const logContext = { ...context };

  if (!isRailwayWebhookPayload(payload)) {
    logger.warn("Skipping non-deployment Railway webhook", {
      provider: PROVIDER,
      operation: "handleWebhook",
      ...logContext,
    });
    return null;
  }

  const { deployment } = payload;

  logger.info("Processing Railway deployment webhook", {
    provider: PROVIDER,
    operation: "handleWebhook",
    deploymentId: deployment.id,
    status: deployment.status,
    ...logContext,
  });

  return {
    entityId: deployment.id,
    platform: PROVIDER,
    eventType: mapTypeToEventType(payload.type),
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

  try {
    const response = await resilientPost<RailwayDeploymentLogsResponse>(
      RAILWAY_API_URL,
      {
        query: DEPLOYMENT_LOGS_QUERY,
        variables: { deploymentId: params.entityId },
      },
      {
        timeout: RAILWAY_TIMEOUT_MS,
        maxRetries: RAILWAY_MAX_RETRIES,
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const entries = response.data.data?.deploymentLogs ?? [];
    const rawLog = entries.map((entry) => `[${entry.severity}] ${entry.message}`).join("\n");

    const durationMs = Date.now() - startTime;
    logger.info("Fetched Railway deployment logs", {
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

    logger.error("Failed to fetch Railway deployment logs", {
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

/** Railway does not support log drains in Phase 1. Returns empty result. */
const parseLogDrainBatch = async (
  _payload: unknown,
  _context: RequestContext
): Promise<LogDrainBatchResult> => ({
  entityId: "",
  lines: [],
  platform: PROVIDER,
});

// ==================== Streaming Subscription ====================

/**
 * Subscribe to real-time Railway deployment logs via WebSocket.
 * Falls back gracefully to REST polling if WebSocket is unavailable.
 */
const subscribe = async (
  entityId: string,
  onLine: (line: LogLine) => void,
  context: RequestContext
): Promise<{ readonly close: () => Promise<void> }> =>
  subscribeToRailwayLogs({ deploymentId: entityId, apiToken: "" }, onLine, context);

// ==================== Adapter Export ====================

export const railwayLogAdapter: DeployLogSourcePort = {
  verifySignature: verifyRailwaySignature,
  handleWebhook,
  fetchDeployLogs,
  parseLogDrainBatch,
  subscribe,
};
