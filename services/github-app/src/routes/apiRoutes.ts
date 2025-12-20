/**
 * API Routes for n8n Integration
 *
 * Provides endpoints for n8n to interact with GitHub
 */

import { Router, type Request, type Response } from "express";
import { asyncHandler, createLogger, HTTP_STATUS, validate, validators } from "@kenchi/shared";
import { postPRComment } from "../services/githubService.js";
import { appConfig } from "../config/appConfig.js";
import { formatGitHubComment } from "../formatters/commentFormatter.js";

const router = Router();
const logger = createLogger("github-app");

/**
 * POST /api/github/comment
 * Post a comment to a GitHub PR (called by n8n after analysis)
 */
router.post(
  "/api/github/comment",
  validate({
    body: {
      repository: (v) => validators.required(v) && validators.string(v),
      pr_number: (v) => validators.required(v) && typeof v === "number",
      analysis: (v) => validators.required(v) && typeof v === "object",
    },
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const { repository, pr_number, analysis } = req.body;

    // Parse repository (owner/repo format)
    const [owner, repo] = repository.split("/");
    if (!owner || !repo) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: "Invalid repository format. Expected 'owner/repo'",
      });
      return;
    }

    // Get installation ID from config
    const installationId = appConfig.github.installationId;
    if (!installationId) {
      logger.warn("No GitHub installation ID configured");
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: "GitHub installation ID not configured",
      });
      return;
    }

    // Format the comment
    const comment = formatGitHubComment({
      summary: analysis.analysis || analysis.summary || "Analysis unavailable",
      identified_cause: analysis.identified_cause,
      confidence: analysis.confidence || 0.5,
      recommended_actions: analysis.recommended_actions,
      repository,
    });

    try {
      await postPRComment(installationId, owner, repo, pr_number, comment);

      logger.info("Posted analysis comment to GitHub PR", {
        repository,
        prNumber: pr_number,
      });

      res.status(HTTP_STATUS.OK).json({
        status: "posted",
        repository,
        pr_number,
      });
    } catch (error) {
      logger.error("Failed to post comment to GitHub", {
        repository,
        prNumber: pr_number,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        status: "error",
        error: error instanceof Error ? error.message : "Failed to post comment",
      });
    }
  })
);

export { router as apiRoutes };
