/**
 * HTTP routes for n8n integration.
 * Provides endpoints for posting messages to Slack without going through Slack events.
 *
 * This is a thin routing layer that delegates business logic to handlers.
 */

import express, { type Request, type Response } from "express";
import { validate, validators, HTTP_STATUS, asyncHandler } from "@kenchi/shared";
import type Bolt from "@slack/bolt";
import { postMessage, broadcastMessage } from "../handlers/channelHandler.js";
import type { SlackMessageRequest, SlackBroadcastRequest } from "../types/slackTypes.js";

type SlackApp = InstanceType<typeof Bolt.App>;

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
   * Post a message to Slack (for n8n workflow integration)
   * Supports plain text messages OR structured analysis data
   * Channel is optional - if not provided, uses bot's active channel (single-channel policy)
   */
  router.post(
    "/slack/message",
    validate({
      body: {
        // Channel is optional - bot uses its active channel if not specified
        channel: (v) => !v || validators.string(v),
        // message is optional if analysis is provided
        message: (v) => !v || validators.string(v),
        thread_ts: (v) => !v || validators.string(v),
        // analysis object for rich formatting
        analysis: (v) => !v || (typeof v === "object" && v !== null),
      },
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const request = req.body as SlackMessageRequest;

      // Validate that either message or analysis is provided
      if (!request.message && !request.analysis) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: "Either message or analysis must be provided",
        });
        return;
      }

      const response = await postMessage(app.client, request);

      const statusCode =
        response.status === "sent" ? HTTP_STATUS.OK : HTTP_STATUS.INTERNAL_SERVER_ERROR;

      res.status(statusCode).json(response);
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
      environment: process.env.NODE_ENV || "development",
    });
  });

  return router;
};
