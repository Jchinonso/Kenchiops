/**
 * GitHub Webhook Routes
 *
 * Handles incoming webhooks from GitHub
 */

import { Router, type Request, type Response } from "express";
import { asyncHandler, createLogger, HTTP_STATUS } from "@kenchi/shared";
import { handlePullRequest } from "../handlers/pullRequestHandler.js";
import { handleCheckRun } from "../handlers/checkRunHandler.js";
import { handleInstallation } from "../handlers/installationHandler.js";
import { verifyGitHubWebhook } from "../middleware/verifyGithub.js";
import type {
  PullRequestWebhook,
  CheckRunWebhook,
  InstallationWebhook,
} from "../types/githubTypes.js";

const router = Router();
const logger = createLogger("github-app");

/**
 * Webhook handler result with optional fields
 */
interface WebhookHandlerResult {
  readonly handled: boolean;
  readonly message: string;
  readonly eventId?: string;
  readonly tenantId?: string;
}

/**
 * GitHub event handler configuration
 */
interface GitHubEventHandler {
  readonly handle: (body: unknown) => Promise<WebhookHandlerResult>;
  readonly formatResponse: (result: WebhookHandlerResult) => object;
}

/**
 * Format standard webhook response
 */
const formatStandardResponse = (result: WebhookHandlerResult): object => ({
  status: result.handled ? "processed" : "skipped",
  message: result.message,
  eventId: result.eventId,
});

/**
 * Format installation webhook response (includes tenantId)
 */
const formatInstallationResponse = (result: WebhookHandlerResult): object => ({
  status: result.handled ? "processed" : "skipped",
  message: result.message,
  tenantId: result.tenantId,
});

/**
 * Event handler lookup table
 */
const eventHandlers: Record<string, GitHubEventHandler> = {
  pull_request: {
    handle: (body) => handlePullRequest(body as PullRequestWebhook),
    formatResponse: formatStandardResponse,
  },
  check_run: {
    handle: (body) => handleCheckRun(body as CheckRunWebhook),
    formatResponse: formatStandardResponse,
  },
  installation: {
    handle: (body) => handleInstallation(body as InstallationWebhook),
    formatResponse: formatInstallationResponse,
  },
};

/**
 * Handle ping event
 */
const handlePing = (deliveryId: string, res: Response): void => {
  logger.info("GitHub webhook ping received", { deliveryId });
  res.status(HTTP_STATUS.OK).json({
    status: "ok",
    message: "Webhook configured successfully",
  });
};

/**
 * Handle unknown event type
 */
const handleUnknownEvent = (eventType: string, deliveryId: string, res: Response): void => {
  logger.info("Unhandled GitHub event type", { eventType, deliveryId });
  res.status(HTTP_STATUS.OK).json({
    status: "ignored",
    message: `Event type '${eventType}' not handled`,
  });
};

/**
 * Unified GitHub webhook handler
 * GitHub sends all events to this single endpoint with X-GitHub-Event header
 * POST /webhook/github
 */
router.post(
  "/webhook/github",
  verifyGitHubWebhook,
  asyncHandler(async (req: Request, res: Response) => {
    const eventType = req.headers["x-github-event"] as string;
    const deliveryId = req.headers["x-github-delivery"] as string;

    logger.info("Received GitHub webhook", {
      eventType,
      deliveryId,
    });

    // Handle ping separately (no async processing needed)
    if (eventType === "ping") {
      handlePing(deliveryId, res);
      return;
    }

    // Look up handler in table
    const handler = eventHandlers[eventType];
    if (!handler) {
      handleUnknownEvent(eventType, deliveryId, res);
      return;
    }

    // Execute handler and format response
    const result = await handler.handle(req.body);
    res.status(HTTP_STATUS.OK).json(handler.formatResponse(result));
  })
);

/**
 * Handle pull request webhook (legacy endpoint)
 * POST /webhook/pull_request
 */
router.post(
  "/webhook/pull_request",
  verifyGitHubWebhook,
  asyncHandler(async (req: Request, res: Response) => {
    const webhook = req.body as PullRequestWebhook;
    const result = await handlePullRequest(webhook);

    res.status(HTTP_STATUS.OK).json({
      status: result.handled ? "processed" : "skipped",
      message: result.message,
      eventId: result.eventId,
    });
  })
);

/**
 * Handle check run webhook (legacy endpoint)
 * POST /webhook/check_run
 */
router.post(
  "/webhook/check_run",
  verifyGitHubWebhook,
  asyncHandler(async (req: Request, res: Response) => {
    const webhook = req.body as CheckRunWebhook;
    const result = await handleCheckRun(webhook);

    res.status(HTTP_STATUS.OK).json({
      status: result.handled ? "processed" : "skipped",
      message: result.message,
      eventId: result.eventId,
    });
  })
);

export { router as webhookRoutes };
