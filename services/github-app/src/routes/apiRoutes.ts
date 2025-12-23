/**
 * API Routes for GitHub Integration
 *
 * Provides endpoints for external services to interact with GitHub
 */

import { Router, type Request, type Response } from "express";
import { asyncHandler, createLogger, HTTP_STATUS, validate, validators } from "@kenchi/shared";
import {
  postPRComment,
  createCheckRunWithAnnotations,
  type CheckAnnotation,
} from "../services/githubService.js";
import { appConfig } from "../config/appConfig.js";
import { formatGitHubComment } from "../formatters/commentFormatter.js";

const router = Router();
const logger = createLogger("github-app");

/**
 * POST /api/github/comment
 * Post a comment to a GitHub PR
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

    // Format the comment with all enriched context
    const comment = formatGitHubComment({
      summary: analysis.analysis || analysis.summary,
      analysis: analysis.analysis,
      identified_cause: analysis.identified_cause,
      confidence: analysis.confidence || 0.5,
      recommended_actions: analysis.recommended_actions,
      repository,
      checkName: analysis.checkName,
      headSha: analysis.headSha,
      annotations: analysis.annotations,
      testFailures: analysis.testFailures,
      prContext: analysis.prContext,
      workflowContext: analysis.workflowContext,
      dependencyChanges: analysis.dependencyChanges,
    });

    try {
      // Post the comment
      await postPRComment(installationId, owner, repo, pr_number, comment);

      // Also create check run with annotations if we have any
      if (analysis.annotations && analysis.annotations.length > 0 && analysis.headSha) {
        const checkAnnotations: CheckAnnotation[] = analysis.annotations.map(
          (ann: {
            path: string;
            startLine: number;
            level: string;
            message: string;
            title?: string;
          }) => ({
            path: ann.path,
            start_line: ann.startLine,
            end_line: ann.startLine,
            annotation_level:
              ann.level === "failure" ? "failure" : ann.level === "warning" ? "warning" : "notice",
            message: ann.message,
            title: ann.title,
          })
        );

        await createCheckRunWithAnnotations(
          installationId,
          owner,
          repo,
          analysis.headSha,
          "KenchiOps Analysis",
          analysis.identified_cause || analysis.analysis || "CI failure analyzed",
          checkAnnotations
        );
      }

      logger.info("Posted analysis comment to GitHub PR", {
        repository,
        prNumber: pr_number,
        annotationCount: analysis.annotations?.length || 0,
      });

      res.status(HTTP_STATUS.OK).json({
        status: "posted",
        repository,
        pr_number,
        annotations_posted: analysis.annotations?.length || 0,
      });
    } catch (error) {
      logger.error("Failed to post to GitHub", {
        repository,
        prNumber: pr_number,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        status: "error",
        error: error instanceof Error ? error.message : "Failed to post to GitHub",
      });
    }
  })
);

/**
 * POST /api/github/annotations
 * Create a check run with annotations for line-level feedback
 */
router.post(
  "/api/github/annotations",
  validate({
    body: {
      repository: (v) => validators.required(v) && validators.string(v),
      head_sha: (v) => validators.required(v) && validators.string(v),
      annotations: (v) => validators.required(v) && Array.isArray(v),
      summary: (v) => validators.required(v) && validators.string(v),
    },
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const { repository, head_sha, annotations, summary, check_name } = req.body;

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

    // Convert annotations to GitHub format
    const checkAnnotations: CheckAnnotation[] = annotations.map(
      (ann: { path: string; line: number; level?: string; message: string; title?: string }) => ({
        path: ann.path,
        start_line: ann.line,
        end_line: ann.line,
        annotation_level:
          ann.level === "failure" ? "failure" : ann.level === "warning" ? "warning" : "notice",
        message: ann.message,
        title: ann.title,
      })
    );

    try {
      await createCheckRunWithAnnotations(
        installationId,
        owner,
        repo,
        head_sha,
        check_name || "KenchiOps Analysis",
        summary,
        checkAnnotations
      );

      logger.info("Created check run with annotations", {
        repository,
        headSha: head_sha,
        annotationCount: checkAnnotations.length,
      });

      res.status(HTTP_STATUS.OK).json({
        status: "created",
        repository,
        head_sha,
        annotation_count: checkAnnotations.length,
      });
    } catch (error) {
      logger.error("Failed to create check run with annotations", {
        repository,
        headSha: head_sha,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        status: "error",
        error: error instanceof Error ? error.message : "Failed to create check run",
      });
    }
  })
);

export { router as apiRoutes };
