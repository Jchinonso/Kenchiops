/**
 * HTTP routes for CI failure processing.
 * Provides endpoints for posting messages to Slack without going through Slack events.
 *
 * This is a thin routing layer that delegates business logic to handlers.
 * Supports both single-tenant and multi-tenant modes.
 */

import express, { type Request, type Response } from "express";
import {
  validate,
  validators,
  HTTP_STATUS,
  asyncHandler,
  config,
  HEALTH_STATUS,
  performHealthCheck,
  livenessCheck,
  readinessCheck,
} from "@kenchi/shared";
import type Bolt from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import type { AppConfig } from "../config/appConfig.js";
import {
  postMessage,
  postConsolidatedMessage,
  broadcastMessage,
} from "../services/messageService.js";
import { getSlackClientForTenant, isMultiTenantEnabled } from "../services/tenantSlackClient.js";
import type {
  SlackMessageRequest,
  SlackBroadcastRequest,
  ConsolidatedMessageRequest,
} from "../types/slackTypes.js";

type SlackApp = InstanceType<typeof Bolt.App>;

/**
 * Extended request type with installation_id
 */
type MessageRequestWithTenant = SlackMessageRequest & { readonly installation_id?: number };

/**
 * Union type for message or consolidated request
 */
type IncomingMessageRequest = MessageRequestWithTenant | ConsolidatedMessageRequest;

/**
 * Type guard for consolidated message requests
 */
const isConsolidatedRequest = (
  request: IncomingMessageRequest
): request is ConsolidatedMessageRequest =>
  "consolidated" in request && request.consolidated === true;

/**
 * Result of getting a Slack client
 */
type ClientResult = { success: true; client: WebClient } | { success: false; error: string };

/**
 * Get Slack client based on multi-tenant mode
 */
const getClientForRequest = async (
  defaultClient: WebClient,
  installationId: number | undefined
): Promise<ClientResult> => {
  const useMultiTenant = isMultiTenantEnabled() && installationId !== undefined;

  if (!useMultiTenant) {
    return { success: true, client: defaultClient };
  }

  try {
    const client = await getSlackClientForTenant(installationId);
    return { success: true, client };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get Slack client for tenant",
    };
  }
};

/**
 * Check if message request has valid content
 */
const hasValidContent = (request: IncomingMessageRequest): boolean => {
  if (isConsolidatedRequest(request)) {
    return !!(request.payload?.blocks && request.payload.blocks.length > 0);
  }
  return !!(request.message || request.analysis);
};

/**
 * Status code lookup based on response status
 */
const STATUS_CODE_MAP: Record<string, number> = {
  sent: HTTP_STATUS.OK,
  error: HTTP_STATUS.INTERNAL_SERVER_ERROR,
  partial: HTTP_STATUS.OK,
};

/**
 * Get HTTP status code for response
 */
const getStatusCode = (status: string): number =>
  STATUS_CODE_MAP[status] ?? HTTP_STATUS.INTERNAL_SERVER_ERROR;

/**
 * Creates HTTP routes for the Slack bot service.
 *
 * @param app - Slack Bolt app instance
 * @param appConfig - Application configuration (optional, for health checks)
 * @returns Express router with routes
 */
export const createHttpRoutes = (app: SlackApp, appConfig?: AppConfig): express.Router => {
  const router = express.Router();

  /** Health check config for this service */
  const healthConfig = {
    serviceName: appConfig?.serviceName ?? "slack-bot",
    version: appConfig?.version ?? "1.0.0",
    environment: config.NODE_ENV || "development",
    includeDatabase: true,
    includeRedis: true,
    includeCircuitBreakers: true,
  } as const;

  /**
   * POST /slack/message
   * Post a message to Slack (for CI failure integration)
   * Supports plain text messages, structured analysis data, or consolidated CI failures
   * Channel is optional - if not provided, uses bot's active channel (single-channel policy)
   *
   * Multi-tenant mode: Requires installation_id to identify the tenant
   *
   * Consolidated mode: When consolidated=true, payload contains pre-built Block Kit message
   */
  router.post(
    "/slack/message",
    validate({
      body: {
        installation_id: (value) => !value || validators.number(value),
        channel: (value) => !value || validators.string(value),
        message: (value) => !value || validators.string(value),
        thread_ts: (value) => !value || validators.string(value),
        analysis: (value) => !value || (typeof value === "object" && value !== null),
        // Consolidated message fields
        consolidated: (value) =>
          value === undefined || typeof value === "boolean" || "must be a boolean",
        payload: (value) => !value || (typeof value === "object" && value !== null),
        repository: (value) => !value || validators.string(value),
        commit_sha: (value) => !value || validators.string(value),
        failure_count: (value) => !value || validators.number(value),
      },
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const request = req.body as IncomingMessageRequest;

      // Validate content presence
      if (!hasValidContent(request)) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: "Either message, analysis, or consolidated payload must be provided",
        });
        return;
      }

      // Get installation ID based on request type
      const installationId = isConsolidatedRequest(request)
        ? request.installation_id
        : request.installation_id;

      // Get appropriate client
      const clientResult = await getClientForRequest(app.client, installationId);
      if (!clientResult.success) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({ error: clientResult.error });
        return;
      }

      // Handle consolidated vs regular messages
      const response = isConsolidatedRequest(request)
        ? await postConsolidatedMessage(clientResult.client, request)
        : await postMessage(clientResult.client, request);

      res.status(getStatusCode(response.status)).json(response);
    })
  );

  /**
   * POST /slack/broadcast
   * Broadcast a message to ALL channels the bot is a member of
   */
  router.post(
    "/slack/broadcast",
    validate({
      body: {
        message: (value) => validators.required(value) && validators.string(value),
      },
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const request = req.body as SlackBroadcastRequest;
      const response = await broadcastMessage(app.client, request);

      res.status(HTTP_STATUS.OK).json(response);
    })
  );

  /**
   * Comprehensive health check endpoint
   * GET /health
   * Returns detailed component health status
   */
  router.get(
    "/health",
    asyncHandler(async (_req: Request, res: Response) => {
      const health = await performHealthCheck(healthConfig);
      const statusCode =
        health.status === HEALTH_STATUS.UNHEALTHY
          ? HTTP_STATUS.SERVICE_UNAVAILABLE
          : HTTP_STATUS.OK;

      res.status(statusCode).json(health);
    })
  );

  /**
   * Liveness probe endpoint
   * GET /live
   * Simple check that the process is running (for Kubernetes liveness probes)
   */
  router.get("/live", (_req: Request, res: Response) => {
    res.status(HTTP_STATUS.OK).json(livenessCheck());
  });

  /**
   * Readiness probe endpoint
   * GET /ready
   * Checks if service can accept traffic (for Kubernetes readiness probes)
   */
  router.get(
    "/ready",
    asyncHandler(async (_req: Request, res: Response) => {
      const result = await readinessCheck({
        serviceName: healthConfig.serviceName,
        version: healthConfig.version,
        environment: healthConfig.environment,
        includeDatabase: true,
        includeRedis: true,
      });

      const statusCode = result.ready ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;
      res.status(statusCode).json(result);
    })
  );

  return router;
};
