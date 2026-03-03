/**
 * API Routes for GitHub Integration
 *
 * Provides endpoints for external services to interact with GitHub
 */

import { Router, type Request, type Response } from "express";
import {
  asyncHandler,
  createLogger,
  HTTP_STATUS,
  validate,
  validators,
  getErrorMessage,
  KENCHI_BRANDING,
  formatGitHubComment,
  type OutputContext,
  type LLMAnalysisResult,
} from "@kenchi/shared";
import {
  postPRComment,
  createCheckRunWithAnnotations,
  getInstallationRepositories,
  type CheckAnnotation,
  type RepositoryInfo,
} from "../services/githubService.js";
import {
  rerunFailedJobs,
  getWorkflowRunIdForCheckRun,
  getCheckSuiteIdForRun,
  rerequestCheckSuite,
  type RerunResult,
} from "../services/workflowService.js";
import { appConfig } from "../config/appConfig.js";
import type { RerunRequestBody } from "./apiRoutesTypes.js";

const router = Router();
const logger = createLogger("github-app");

/**
 * POST /api/github/comment
 * Post a comment to a GitHub PR
 */
router.post(
  "/comment",
  validate({
    body: {
      repository: (value) => validators.required(value) && validators.string(value),
      pr_number: (value) => validators.required(value) && typeof value === "number",
      analysis: (value) => validators.required(value) && typeof value === "object",
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
    const { installationId } = appConfig.github;
    if (!installationId) {
      logger.warn("No GitHub installation ID configured");
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: "GitHub installation ID not configured",
      });
      return;
    }

    // Convert to LLMAnalysisResult format for simplified formatter
    const llmAnalysis: LLMAnalysisResult = {
      eventId: analysis.full_analysis?.eventId ?? `${repository}:${analysis.headSha ?? "unknown"}`,
      summary: analysis.analysis ?? analysis.summary ?? "CI failure analyzed",
      identifiedCause: analysis.identified_cause,
      confidence:
        analysis.confidence >= 0.7 ? "high" : analysis.confidence >= 0.4 ? "medium" : "low",
      confidenceScore: analysis.confidence ?? 0.5,
      recommendedActions: analysis.recommended_actions,
      codeAnnotations: analysis.annotations?.map(
        (ann: { path: string; line: number; level: string; message: string; title?: string }) => ({
          path: ann.path,
          line: ann.line,
          level: ann.level as "failure" | "warning" | "notice",
          message: ann.message,
          title: ann.title,
        })
      ),
      analyzedAt: new Date().toISOString(),
    };

    // Create output context
    const context: OutputContext = {
      repository,
      commitSha: analysis.headSha ?? "unknown",
      checkName: analysis.checkName ?? "CI Check",
    };

    // Format using simplified formatter
    const { body: comment } = formatGitHubComment(llmAnalysis, context);

    try {
      // Post the comment
      await postPRComment(installationId, owner, repo, pr_number, comment, true);

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

        await createCheckRunWithAnnotations({
          installationId,
          owner,
          repo,
          headSha: analysis.headSha,
          name: KENCHI_BRANDING.CHECK_RUN_NAME,
          summary: analysis.identified_cause || analysis.analysis || "CI failure analyzed",
          annotations: checkAnnotations,
        });
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
        error: getErrorMessage(error),
      });

      // SECURITY (VULN-507): Return generic message, not internal error details
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        status: "error",
        error: "Failed to post comment to GitHub",
      });
    }
  })
);

/**
 * POST /api/github/annotations
 * Create a check run with annotations for line-level feedback
 */
router.post(
  "/annotations",
  validate({
    body: {
      repository: (value) => validators.required(value) && validators.string(value),
      head_sha: (value) => validators.required(value) && validators.string(value),
      annotations: (value) => validators.required(value) && Array.isArray(value),
      summary: (value) => validators.required(value) && validators.string(value),
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
    const { installationId } = appConfig.github;
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
      await createCheckRunWithAnnotations({
        installationId,
        owner,
        repo,
        headSha: head_sha,
        name: check_name || KENCHI_BRANDING.CHECK_RUN_NAME,
        summary,
        annotations: checkAnnotations,
      });

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
        error: getErrorMessage(error),
      });

      // SECURITY (VULN-507): Return generic message, not internal error details
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        status: "error",
        error: "Failed to create check run with annotations",
      });
    }
  })
);

/**
 * GET /api/installations/:installationId/repositories
 * Fetch all repositories accessible to a GitHub App installation
 */
router.get(
  "/installations/:installationId/repositories",
  asyncHandler(async (req: Request, res: Response) => {
    const installationIdParam = req.params.installationId;

    // Validate installation ID is a valid number
    const installationId = parseInt(installationIdParam, 10);
    if (isNaN(installationId) || installationId <= 0) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: "Invalid installation ID. Must be a positive integer",
      });
      return;
    }

    try {
      const repositories: RepositoryInfo[] = await getInstallationRepositories(installationId);

      logger.info("Fetched repositories for installation", {
        installationId,
        repositoryCount: repositories.length,
      });

      res.status(HTTP_STATUS.OK).json({
        installationId,
        repositories,
        total: repositories.length,
      });
    } catch (error) {
      logger.error("Failed to fetch installation repositories", {
        installationId,
        error: getErrorMessage(error),
      });

      // SECURITY (VULN-507): Return generic message, not internal error details
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: "Failed to fetch repositories for installation",
      });
    }
  })
);

/**
 * Parse repository string into owner and repo
 */
const parseRepository = (repository: string): { owner: string; repo: string } | null => {
  const [owner, repo] = repository.split("/");
  return owner && repo ? { owner, repo } : null;
};

/**
 * Attempt rerun via workflow run ID (preferred method)
 */
const attemptWorkflowRerun = async (
  installationId: number,
  owner: string,
  repo: string,
  workflowRunId: number
): Promise<RerunResult> => {
  logger.info("Attempting rerun via workflow run ID", {
    owner,
    repo,
    workflowRunId,
  });

  return rerunFailedJobs(installationId, owner, repo, workflowRunId);
};

/**
 * Attempt rerun via check run ID (fallback method)
 * First tries to find the workflow run, then falls back to check suite rerequest
 */
const attemptCheckRunRerun = async (
  installationId: number,
  owner: string,
  repo: string,
  checkRunId: number
): Promise<RerunResult> => {
  logger.info("Attempting rerun via check run ID", {
    owner,
    repo,
    checkRunId,
  });

  // Try to get workflow run ID from check run
  const workflowRunId = await getWorkflowRunIdForCheckRun(installationId, owner, repo, checkRunId);

  if (workflowRunId) {
    return rerunFailedJobs(installationId, owner, repo, workflowRunId);
  }

  // Fallback: rerequest check suite
  const checkSuiteId = await getCheckSuiteIdForRun(installationId, owner, repo, checkRunId);

  if (checkSuiteId) {
    return rerequestCheckSuite(installationId, owner, repo, checkSuiteId);
  }

  return {
    success: false,
    message: "Could not find workflow run or check suite for this check run",
    error: "Unable to determine rerun method",
  };
};

/**
 * POST /api/actions/rerun
 * Rerun a failed CI workflow or check run
 * Called by the action executor in the shared package
 */
router.post(
  "/actions/rerun",
  validate({
    body: {
      installationId: (value) => validators.required(value) && typeof value === "number",
      repository: (value) => validators.required(value) && validators.string(value),
    },
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as RerunRequestBody;
    const { installationId, repository, workflowRunId, checkRunId, approvedBy } = body;

    // Parse repository
    const parsed = parseRepository(repository);
    if (!parsed) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Invalid repository format. Expected 'owner/repo'",
      });
      return;
    }

    const { owner, repo } = parsed;

    logger.info("Processing rerun request", {
      repository,
      workflowRunId,
      checkRunId,
      approvedBy,
    });

    // Determine rerun strategy based on available IDs
    const result: RerunResult = workflowRunId
      ? await attemptWorkflowRerun(installationId, owner, repo, workflowRunId)
      : checkRunId
        ? await attemptCheckRunRerun(installationId, owner, repo, checkRunId)
        : {
            success: false,
            message: "No workflow run ID or check run ID provided",
            error: "Missing required identifier",
          };

    logger.info("Rerun request completed", {
      repository,
      success: result.success,
      runId: result.runId,
      approvedBy,
    });

    const statusCode = result.success ? HTTP_STATUS.OK : HTTP_STATUS.INTERNAL_SERVER_ERROR;
    res.status(statusCode).json(result);
  })
);

export { router as apiRoutes };
