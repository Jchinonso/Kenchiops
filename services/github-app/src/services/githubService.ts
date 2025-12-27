/**
 * GitHub Service
 *
 * Handles GitHub API interactions and OpenAI analysis integration.
 * Uses caching for Octokit instances per installation.
 */

import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import {
  createLogger,
  OpenAIClient,
  calculateConfidenceScore,
  generateEventId,
  type Event,
  type Evidence,
  type LLMAnalysisResult,
  type ConfidenceScoreResult,
  LLMError,
  ExternalServiceError,
  getErrorMessage,
  wrapError,
  KENCHI_BRANDING,
  GITHUB_PAGINATION,
} from "@kenchi/shared";
import { appConfig } from "../config/appConfig.js";
import type { PullRequestWebhook, CheckRunWebhook } from "../types/githubTypes.js";

const logger = createLogger("github-app");

/**
 * Cached Octokit instances per installation
 */
const octokitCache = new Map<number, Octokit>();

/**
 * Singleton OpenAI client
 */
let openaiClientInstance: OpenAIClient | null = null;

/**
 * Get or create the OpenAI client singleton
 */
export const getOpenAIClient = (): OpenAIClient => {
  if (!openaiClientInstance) {
    openaiClientInstance = new OpenAIClient();
    logger.info("OpenAI client initialized");
  }
  return openaiClientInstance;
};

/**
 * Get or create an authenticated Octokit instance for an installation
 */
export const getOctokit = async (installationId: number): Promise<Octokit> => {
  // Check cache first
  const cached = octokitCache.get(installationId);
  if (cached) {
    return cached;
  }

  logger.info("Creating new Octokit instance", { installationId });

  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: appConfig.github.appId,
      privateKey: appConfig.github.privateKey,
      installationId,
    },
  });

  // Cache the instance
  octokitCache.set(installationId, octokit);

  return octokit;
};

/**
 * Analysis result with confidence scoring
 */
export interface AnalysisResult {
  readonly analysis: LLMAnalysisResult;
  readonly confidence: ConfidenceScoreResult;
  readonly event: Event;
}

/**
 * Create an Event from a pull request webhook
 */
export const createEventFromPR = (webhook: PullRequestWebhook): Event => ({
  id: generateEventId("pr"),
  type: "MANUAL_TRIGGER",
  source: "github",
  timestamp: new Date().toISOString(),
  severity: "medium",
  title: `PR #${webhook.pull_request.number}: ${webhook.pull_request.title}`,
  payload: {
    action: webhook.action,
    prNumber: webhook.pull_request.number,
    title: webhook.pull_request.title,
    body: webhook.pull_request.body || "",
    repository: webhook.repository.full_name,
    author: webhook.pull_request.user.login,
    headSha: webhook.pull_request.head.sha,
    baseBranch: webhook.pull_request.base.ref,
    headBranch: webhook.pull_request.head.ref,
  },
  metadata: {
    owner: webhook.repository.owner.login,
    repo: webhook.repository.name,
    installationId: webhook.installation?.id,
  },
});

/**
 * Create an Event from a check run webhook
 */
export const createEventFromCheckRun = (webhook: CheckRunWebhook): Event => ({
  id: generateEventId("check"),
  type: "CICD_FAILURE",
  source: "github",
  timestamp: new Date().toISOString(),
  severity: "high",
  title: `CI Failure: ${webhook.check_run.name}`,
  payload: {
    action: webhook.action,
    checkName: webhook.check_run.name,
    conclusion: webhook.check_run.conclusion,
    repository: webhook.repository.full_name,
    output: webhook.check_run.output,
    headSha: webhook.check_run.head_sha,
    pullRequestCount: webhook.check_run.pull_requests.length,
  },
  metadata: {
    owner: webhook.repository.owner.login,
    repo: webhook.repository.name,
    installationId: webhook.installation?.id,
    checkRunId: webhook.check_run.id,
    headSha: webhook.check_run.head_sha,
  },
});

/**
 * Create minimal evidence for analysis
 */
export const createMinimalEvidence = (eventId: string): Evidence => ({
  eventId,
  collectedAt: new Date().toISOString(),
  logs: [],
});

/**
 * Perform OpenAI analysis on an event
 */
export const performAnalysis = async (event: Event): Promise<AnalysisResult> => {
  const evidence = createMinimalEvidence(event.id);
  const openaiClient = getOpenAIClient();

  logger.info("Starting analysis", {
    eventId: event.id,
    type: event.type,
  });

  try {
    const analysis = await openaiClient.analyzeIncident(event, evidence);
    const confidence = calculateConfidenceScore(analysis, evidence);

    logger.info("Analysis completed", {
      eventId: event.id,
      confidence: confidence.finalScore,
      gating: confidence.gatingDecision,
    });

    return { analysis, confidence, event };
  } catch (error) {
    logger.error("Analysis failed", {
      eventId: event.id,
      error: getErrorMessage(error),
    });

    throw new LLMError(wrapError("Failed to analyze", error));
  }
};

/**
 * Marker to identify KenchiOps comments (from centralized branding)
 */
const KENCHIOPS_COMMENT_MARKER = KENCHI_BRANDING.COMMENT_MARKER;

/**
 * Delete existing KenchiOps comments on a PR
 * This keeps the PR clean by removing outdated analysis comments
 */
export const deleteKenchiOpsComments = async (
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number
): Promise<number> => {
  try {
    const octokit = await getOctokit(installationId);

    // List all comments on the PR
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: GITHUB_PAGINATION.DEFAULT_PER_PAGE,
    });

    // Find KenchiOps comments (look for our marker in the body)
    const kenchiOpsComments = comments.filter((comment) =>
      comment.body?.includes(KENCHIOPS_COMMENT_MARKER)
    );

    // Delete each KenchiOps comment
    await Promise.all(
      kenchiOpsComments.map((comment) =>
        octokit.rest.issues.deleteComment({
          owner,
          repo,
          comment_id: comment.id,
        })
      )
    );

    if (kenchiOpsComments.length > 0) {
      logger.info("Deleted old KenchiOps comments", {
        owner,
        repo,
        prNumber,
        deletedCount: kenchiOpsComments.length,
      });
    }

    return kenchiOpsComments.length;
  } catch (error) {
    // Log but don't fail - cleanup is best-effort
    logger.warn("Failed to delete old KenchiOps comments", {
      owner,
      repo,
      prNumber,
      error: getErrorMessage(error),
    });
    return 0;
  }
};

/**
 * Post a comment on a pull request
 * Optionally deletes existing KenchiOps comments first
 */
export const postPRComment = async (
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
  deleteOldComments = false
): Promise<void> => {
  try {
    const octokit = await getOctokit(installationId);

    // Delete old KenchiOps comments if requested
    if (deleteOldComments) {
      await deleteKenchiOpsComments(installationId, owner, repo, prNumber);
    }

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });

    logger.info("Posted PR comment", {
      owner,
      repo,
      prNumber,
    });
  } catch (error) {
    logger.error("Failed to post PR comment", {
      owner,
      repo,
      prNumber,
      error: getErrorMessage(error),
    });

    throw new ExternalServiceError("GitHub", wrapError("Failed to post comment", error), {
      owner,
      repo,
      prNumber,
    });
  }
};

/**
 * Repository info returned from GitHub API
 */
export interface RepositoryInfo {
  readonly id: number;
  readonly name: string;
  readonly fullName: string;
  readonly private: boolean;
  readonly defaultBranch: string;
}

/**
 * Recursively fetch all repositories using pagination.
 */
const fetchRepositoriesPage = async (
  octokit: Awaited<ReturnType<typeof getOctokit>>,
  page: number,
  perPage: number,
  accumulated: readonly RepositoryInfo[]
): Promise<readonly RepositoryInfo[]> => {
  const { data } = await octokit.rest.apps.listReposAccessibleToInstallation({
    per_page: perPage,
    page,
  });

  const repos = data.repositories.map((repo) => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    private: repo.private,
    defaultBranch: repo.default_branch ?? "main",
  }));

  const allRepos = [...accumulated, ...repos];

  // Base case: no more pages to fetch
  if (repos.length < perPage || allRepos.length >= data.total_count) {
    return allRepos;
  }

  // Recursive case: fetch next page
  return fetchRepositoriesPage(octokit, page + 1, perPage, allRepos);
};

/**
 * Fetch all repositories accessible to a GitHub App installation
 */
export const getInstallationRepositories = async (
  installationId: number
): Promise<RepositoryInfo[]> => {
  try {
    const octokit = await getOctokit(installationId);

    // Use recursive pagination with default page size
    const repositories = await fetchRepositoriesPage(
      octokit,
      1,
      GITHUB_PAGINATION.DEFAULT_PER_PAGE,
      []
    );

    logger.info("Fetched installation repositories", {
      installationId,
      repositoryCount: repositories.length,
    });

    return [...repositories];
  } catch (error) {
    logger.error("Failed to fetch installation repositories", {
      installationId,
      error: getErrorMessage(error),
    });

    throw new ExternalServiceError("GitHub", wrapError("Failed to fetch repositories", error), {
      installationId,
    });
  }
};

/**
 * Annotation for a check run
 */
export interface CheckAnnotation {
  readonly path: string;
  readonly start_line: number;
  readonly end_line: number;
  readonly annotation_level: "notice" | "warning" | "failure";
  readonly message: string;
  readonly title?: string;
}

/**
 * GitHub API annotation batch size limit (from centralized pagination config)
 */
const MAX_ANNOTATIONS_PER_CALL = GITHUB_PAGINATION.MAX_ANNOTATIONS_PER_CALL;

/**
 * Result of a workflow rerun attempt
 */
export interface RerunResult {
  readonly success: boolean;
  readonly message: string;
  readonly runId?: number;
  readonly error?: string;
}

/**
 * Rerun a failed workflow by workflow run ID
 */
export const rerunWorkflow = async (
  installationId: number,
  owner: string,
  repo: string,
  workflowRunId: number
): Promise<RerunResult> => {
  try {
    const octokit = await getOctokit(installationId);

    await octokit.rest.actions.reRunWorkflow({
      owner,
      repo,
      run_id: workflowRunId,
    });

    logger.info("Workflow rerun triggered", {
      owner,
      repo,
      workflowRunId,
    });

    return {
      success: true,
      message: `Workflow rerun triggered for run ${workflowRunId}`,
      runId: workflowRunId,
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("Failed to rerun workflow", {
      owner,
      repo,
      workflowRunId,
      error: errorMessage,
    });

    return {
      success: false,
      message: "Failed to rerun workflow",
      error: errorMessage,
    };
  }
};

/**
 * Rerun failed jobs in a workflow run
 * More efficient than rerunning the entire workflow
 */
export const rerunFailedJobs = async (
  installationId: number,
  owner: string,
  repo: string,
  workflowRunId: number
): Promise<RerunResult> => {
  try {
    const octokit = await getOctokit(installationId);

    await octokit.rest.actions.reRunWorkflowFailedJobs({
      owner,
      repo,
      run_id: workflowRunId,
    });

    logger.info("Failed jobs rerun triggered", {
      owner,
      repo,
      workflowRunId,
    });

    return {
      success: true,
      message: `Failed jobs rerun triggered for run ${workflowRunId}`,
      runId: workflowRunId,
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("Failed to rerun failed jobs", {
      owner,
      repo,
      workflowRunId,
      error: errorMessage,
    });

    return {
      success: false,
      message: "Failed to rerun failed jobs",
      error: errorMessage,
    };
  }
};

/**
 * Rerequest a check suite (triggers all checks in the suite)
 */
export const rerequestCheckSuite = async (
  installationId: number,
  owner: string,
  repo: string,
  checkSuiteId: number
): Promise<RerunResult> => {
  try {
    const octokit = await getOctokit(installationId);

    await octokit.rest.checks.rerequestSuite({
      owner,
      repo,
      check_suite_id: checkSuiteId,
    });

    logger.info("Check suite rerequest triggered", {
      owner,
      repo,
      checkSuiteId,
    });

    return {
      success: true,
      message: `Check suite rerequest triggered for suite ${checkSuiteId}`,
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("Failed to rerequest check suite", {
      owner,
      repo,
      checkSuiteId,
      error: errorMessage,
    });

    return {
      success: false,
      message: "Failed to rerequest check suite",
      error: errorMessage,
    };
  }
};

/**
 * Get check suite ID for a check run
 * Needed when we only have check_run_id but need to rerequest the suite
 */
export const getCheckSuiteIdForRun = async (
  installationId: number,
  owner: string,
  repo: string,
  checkRunId: number
): Promise<number | null> => {
  try {
    const octokit = await getOctokit(installationId);

    const { data: checkRun } = await octokit.rest.checks.get({
      owner,
      repo,
      check_run_id: checkRunId,
    });

    return checkRun.check_suite?.id ?? null;
  } catch (error) {
    logger.error("Failed to get check suite ID", {
      owner,
      repo,
      checkRunId,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Get workflow run ID from a check run
 * Check runs created by GitHub Actions have an associated workflow run
 */
export const getWorkflowRunIdForCheckRun = async (
  installationId: number,
  owner: string,
  repo: string,
  checkRunId: number
): Promise<number | null> => {
  try {
    const octokit = await getOctokit(installationId);

    const { data: checkRun } = await octokit.rest.checks.get({
      owner,
      repo,
      check_run_id: checkRunId,
    });

    // GitHub Actions check runs have the workflow run in the details_url
    // Pattern: https://github.com/owner/repo/actions/runs/RUN_ID/job/JOB_ID
    const detailsUrl = checkRun.details_url;
    if (detailsUrl) {
      const match = detailsUrl.match(/\/actions\/runs\/(\d+)/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }

    return null;
  } catch (error) {
    logger.error("Failed to get workflow run ID for check run", {
      owner,
      repo,
      checkRunId,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Split array into batches of specified size
 */
const batchArray = <T>(array: T[], batchSize: number): T[][] => {
  const batchCount = Math.ceil(array.length / batchSize);
  return Array.from({ length: batchCount }, (_, i) =>
    array.slice(i * batchSize, (i + 1) * batchSize)
  );
};

/**
 * Create a check run with annotations
 * This posts line-level feedback directly on the PR files
 */
export const createCheckRunWithAnnotations = async (
  installationId: number,
  owner: string,
  repo: string,
  headSha: string,
  name: string,
  summary: string,
  annotations: CheckAnnotation[]
): Promise<void> => {
  try {
    const octokit = await getOctokit(installationId);

    // Split annotations into batches (GitHub limits to 50 per API call)
    const annotationBatches = batchArray(annotations, MAX_ANNOTATIONS_PER_CALL);

    // Create the check run with first batch
    const { data: checkRun } = await octokit.rest.checks.create({
      owner,
      repo,
      name,
      head_sha: headSha,
      status: "completed",
      conclusion: annotations.some((a) => a.annotation_level === "failure") ? "failure" : "neutral",
      output: {
        title: "KenchiOps CI Analysis",
        summary,
        annotations: annotationBatches[0] || [],
      },
    });

    // Update with remaining batches (if any)
    const remainingBatches = annotationBatches.slice(1);
    await Promise.all(
      remainingBatches.map((batch) =>
        octokit.rest.checks.update({
          owner,
          repo,
          check_run_id: checkRun.id,
          output: {
            title: "KenchiOps CI Analysis",
            summary,
            annotations: batch,
          },
        })
      )
    );

    logger.info("Created check run with annotations", {
      owner,
      repo,
      headSha,
      checkRunId: checkRun.id,
      annotationCount: annotations.length,
    });
  } catch (error) {
    logger.error("Failed to create check run with annotations", {
      owner,
      repo,
      headSha,
      error: getErrorMessage(error),
    });

    throw new ExternalServiceError("GitHub", wrapError("Failed to create check run", error), {
      owner,
      repo,
      headSha,
    });
  }
};
