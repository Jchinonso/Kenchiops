/**
 * GitHub Webhook Routes
 *
 * Handles incoming webhooks from GitHub
 */

import { Router, type Request, type Response } from "express";
import { asyncHandler, createLogger, HTTP_STATUS } from "@kenchi/shared";
import { handlePullRequest } from "../handlers/pullRequestHandler.js";
import { handleCheckRun } from "../handlers/checkRunHandler.js";
import { verifyGitHubWebhook } from "../middleware/verifyGithub.js";
import type { PullRequestWebhook, CheckRunWebhook } from "../types/githubTypes.js";

const router = Router();
const logger = createLogger("github-app");

// Apply webhook signature verification to all webhook routes
router.use(verifyGitHubWebhook);

/**
 * Unified GitHub webhook handler
 * GitHub sends all events to this single endpoint with X-GitHub-Event header
 * POST /webhook/github
 */
router.post(
  "/webhook/github",
  asyncHandler(async (req: Request, res: Response) => {
    const eventType = req.headers["x-github-event"] as string;
    const deliveryId = req.headers["x-github-delivery"] as string;

    logger.info("Received GitHub webhook", {
      eventType,
      deliveryId,
    });

    switch (eventType) {
      case "pull_request": {
        const webhook = req.body as PullRequestWebhook;
        const result = await handlePullRequest(webhook);
        res.status(HTTP_STATUS.OK).json({
          status: result.handled ? "processed" : "skipped",
          message: result.message,
          eventId: result.eventId,
        });
        break;
      }

      case "check_run": {
        const webhook = req.body as CheckRunWebhook;
        const result = await handleCheckRun(webhook);
        res.status(HTTP_STATUS.OK).json({
          status: result.handled ? "processed" : "skipped",
          message: result.message,
          eventId: result.eventId,
        });
        break;
      }

      case "ping": {
        logger.info("GitHub webhook ping received", { deliveryId });
        res.status(HTTP_STATUS.OK).json({
          status: "ok",
          message: "Webhook configured successfully",
        });
        break;
      }

      default: {
        logger.info("Unhandled GitHub event type", { eventType, deliveryId });
        res.status(HTTP_STATUS.OK).json({
          status: "ignored",
          message: `Event type '${eventType}' not handled`,
        });
      }
    }
  })
);

/**
 * Handle pull request webhook (legacy endpoint)
 * POST /webhook/pull_request
 */
router.post(
  "/webhook/pull_request",
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
