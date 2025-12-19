/**
 * GitHub Webhook Routes
 *
 * Handles incoming webhooks from GitHub
 */

import { Router, type Request, type Response } from "express";
import { asyncHandler, HTTP_STATUS } from "@kenchi/shared";
import { handlePullRequest } from "../handlers/pullRequestHandler.js";
import { handleCheckRun } from "../handlers/checkRunHandler.js";
import { verifyGitHubWebhook } from "../middleware/verifyGithub.js";
import type { PullRequestWebhook, CheckRunWebhook } from "../types/githubTypes.js";

const router = Router();

// Apply webhook signature verification to all webhook routes
router.use(verifyGitHubWebhook);

/**
 * Handle pull request webhook
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
 * Handle check run webhook
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
