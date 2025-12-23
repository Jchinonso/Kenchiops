/**
 * HTTP routes for CI failure processing.
 * Provides endpoints for posting messages to Slack without going through Slack events.
 *
 * This is a thin routing layer that delegates business logic to handlers.
 * Supports both single-tenant and multi-tenant modes.
 */

import express, { type Request, type Response } from "express";
import { validate, validators, HTTP_STATUS, asyncHandler } from "@kenchi/shared";
import type Bolt from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { postMessage, broadcastMessage } from "../handlers/channelHandler.js";
import { getSlackClientForTenant, isMultiTenantEnabled } from "../services/tenantSlackClient.js";
import type { SlackMessageRequest, SlackBroadcastRequest } from "../types/slackTypes.js";

type SlackApp = InstanceType<typeof Bolt.App>;

/**
 * Extended request type with installation_id
 */
type MessageRequestWithTenant = SlackMessageRequest & { readonly installation_id?: number };

/**
 * Result of getting a Slack client
 */
type ClientResult =
  | { success: true; client: WebClient }
  | { success: false; error: string };

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
const hasValidContent = (request: MessageRequestWithTenant): boolean =>
  !!(request.message || request.analysis);

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
 * @returns Express router with routes
 */
export const createHttpRoutes = (app: SlackApp): express.Router => {
  const router = express.Router();

  /**
   * POST /slack/message
   * Post a message to Slack (for CI failure integration)
   * Supports plain text messages OR structured analysis data
   * Channel is optional - if not provided, uses bot's active channel (single-channel policy)
   *
   * Multi-tenant mode: Requires installation_id to identify the tenant
   */
  router.post(
    "/slack/message",
    validate({
      body: {
        installation_id: (v) => !v || validators.number(v),
        channel: (v) => !v || validators.string(v),
        message: (v) => !v || validators.string(v),
        thread_ts: (v) => !v || validators.string(v),
        analysis: (v) => !v || (typeof v === "object" && v !== null),
      },
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const request = req.body as MessageRequestWithTenant;

      // Validate content presence
      if (!hasValidContent(request)) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: "Either message or analysis must be provided",
        });
        return;
      }

      // Get appropriate client
      const clientResult = await getClientForRequest(app.client, request.installation_id);
      if (!clientResult.success) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({ error: clientResult.error });
        return;
      }

      const response = await postMessage(clientResult.client, request);
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
        message: (v) => validators.required(v) && validators.string(v),
      },
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const request = req.body as SlackBroadcastRequest;
      const response = await broadcastMessage(app.client, request);

      res.status(HTTP_STATUS.OK).json(response);
    })
  );

  /**
   * GET /health
   * Health check endpoint
   */
  router.get("/health", (_req: Request, res: Response) => {
    res.status(HTTP_STATUS.OK).json({
      status: "ok",
      service: "slack-bot",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV ?? "development",
    });
  });

  return router;
};
