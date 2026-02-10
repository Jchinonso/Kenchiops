/**
 * Check Run Success Handler
 *
 * Handles successful check runs that previously failed.
 * Captures fix explanations from PR comments for passive knowledge learning.
 *
 * Flow: Success Webhook → Check Previous Failure → Fetch Comments → Ingest Fix Knowledge
 */

import {
  createLogger,
  getCachedCheckAnalysis,
  getErrorMessage,
  ingestPRFixComments,
  createFailureContext,
  KENCHI_BRANDING,
  PR_FIX_COMMENT_CONFIG,
  PASSIVE_LEARNING_TIME,
  getOrFetchCommitPullRequests,
  getOrFetchPullRequestComments,
  getOrFetchPullRequestFiles,
  type PRComment,
  type CachedAnalysis,
} from "@kenchi/shared";
import {
  GITHUB_CHECK_ACTIONS,
  GITHUB_CHECK_CONCLUSIONS,
  type CheckRunWebhook,
} from "../types/githubTypes.js";
import { getOctokit } from "../services/githubService.js";

const successLogger = createLogger("github-app-success-handler");

// ==================== Helper Functions ====================

/**
 * Fetches PR numbers associated with a commit with caching.
 */
const fetchPRsByCommit = async (
  installationId: number,
  owner: string,
  repo: string,
  commitSha: string
): Promise<readonly number[]> => {
  try {
    const cachedPRs = await getOrFetchCommitPullRequests(owner, repo, commitSha, async () => {
      const octokit = await getOctokit(installationId);
      const response = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
        owner,
        repo,
        commit_sha: commitSha,
      });
      return response.data.map((pullRequest) => ({
        number: pullRequest.number,
        title: pullRequest.title,
        state: pullRequest.state,
      }));
    });
    return cachedPRs.map((pullRequest) => pullRequest.number);
  } catch (error) {
    successLogger.warn("Failed to fetch PRs by commit", {
      owner,
      repo,
      commitSha: commitSha.substring(0, 7),
      error: getErrorMessage(error),
    });
    return [];
  }
};

// ==================== Types ====================

/**
 * Result of handling a successful check run.
 */
export interface CheckRunSuccessResult {
  readonly handled: boolean;
  readonly message: string;
  readonly fixCommentsIngested?: number;
  readonly previousFailure?: {
    readonly checkName: string;
    readonly failedAt: string;
    readonly errorSummary: string;
  };
}

// ==================== Helper Functions ====================

/**
 * Checks if this is a successful check run we should process.
 */
const shouldProcessSuccess = (webhook: CheckRunWebhook): boolean => {
  const { action, check_run } = webhook;

  // Skip our own check runs
  if (check_run.name === KENCHI_BRANDING.CHECK_RUN_NAME) {
    return false;
  }

  // Only process completed check runs with success conclusion
  return (
    action === GITHUB_CHECK_ACTIONS.COMPLETED &&
    check_run.conclusion === GITHUB_CHECK_CONCLUSIONS.SUCCESS
  );
};

/**
 * Fetches all comments from a PR with caching.
 */
const fetchAllPRComments = async (
  owner: string,
  repo: string,
  prNumber: number,
  installationId: number
): Promise<readonly PRComment[]> => {
  try {
    const cachedComments = await getOrFetchPullRequestComments(owner, repo, prNumber, async () => {
      const octokit = await getOctokit(installationId);

      const response = await octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: prNumber,
        per_page: PR_FIX_COMMENT_CONFIG.MAX_COMMENTS_TO_FETCH,
      });

      return response.data.map((comment) => ({
        id: comment.id,
        body: comment.body ?? "",
        user: comment.user?.login ?? "unknown",
        createdAt: comment.created_at,
      }));
    });

    // Convert cached comments to PRComment format
    return cachedComments.map((comment) => ({
      id: String(comment.id),
      author: comment.user,
      body: comment.body,
      createdAt: comment.createdAt,
      updatedAt: comment.createdAt, // Use createdAt as fallback
    }));
  } catch (error) {
    successLogger.error("Failed to fetch PR comments", {
      owner,
      repo,
      prNumber,
      error: getErrorMessage(error),
    });
    return [];
  }
};

/**
 * Fetches list of changed files in the PR with caching.
 */
const fetchChangedFiles = async (
  owner: string,
  repo: string,
  prNumber: number,
  installationId: number
): Promise<readonly string[]> => {
  try {
    return await getOrFetchPullRequestFiles(owner, repo, prNumber, async () => {
      const octokit = await getOctokit(installationId);

      const response = await octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: prNumber,
        per_page: PR_FIX_COMMENT_CONFIG.MAX_COMMENTS_TO_FETCH,
      });

      return response.data.map((file) => file.filename);
    });
  } catch (error) {
    successLogger.warn("Failed to fetch changed files", {
      owner,
      repo,
      prNumber,
      error: getErrorMessage(error),
    });
    return [];
  }
};

/**
 * Extracts error summary from cached analysis.
 */
const extractErrorSummary = (cachedAnalysis: CachedAnalysis): string => {
  const maxLength = PASSIVE_LEARNING_TIME.TITLE_PREFIX_MAX_LENGTH * 2;

  if (cachedAnalysis.identifiedCause) {
    return cachedAnalysis.identifiedCause.slice(0, maxLength);
  }

  if (cachedAnalysis.analysis) {
    return cachedAnalysis.analysis.slice(0, maxLength);
  }

  return `${cachedAnalysis.checkName} failure`;
};

// ==================== Main Handler ====================

/**
 * Handles a successful check run to capture fix knowledge.
 *
 * When a check run succeeds after previously failing, this handler:
 * 1. Retrieves the cached failure analysis
 * 2. Fetches PR comments added after the failure
 * 3. Analyzes comments for fix explanations
 * 4. Ingests valuable fix knowledge into the RAG system
 */
export const handleCheckRunSuccess = async (
  webhook: CheckRunWebhook
): Promise<CheckRunSuccessResult> => {
  if (!shouldProcessSuccess(webhook)) {
    return {
      handled: false,
      message: "Not a success event to process",
    };
  }

  const { check_run, repository, installation } = webhook;
  const repoFullName = repository.full_name;
  const [owner, repo] = repoFullName.split("/");
  const installationId = installation?.id ?? 0;

  successLogger.info("Processing successful check run for fix capture", {
    repository: repoFullName,
    checkName: check_run.name,
    commitSha: check_run.head_sha.substring(0, 7),
  });

  try {
    // Check if we have a cached failure analysis for this check
    const cachedFailure = await getCachedCheckAnalysis(
      repoFullName,
      check_run.head_sha,
      check_run.name
    );

    if (!cachedFailure) {
      successLogger.debug("No previous failure found for this check, skipping", {
        repository: repoFullName,
        checkName: check_run.name,
      });
      return {
        handled: false,
        message: "No previous failure to learn from",
      };
    }

    // Get PRs associated with this commit
    const prs = await fetchPRsByCommit(installationId, owner, repo, check_run.head_sha);

    if (prs.length === 0) {
      successLogger.debug("No PRs associated with commit, skipping fix capture", {
        repository: repoFullName,
        commitSha: check_run.head_sha.substring(0, 7),
      });
      return {
        handled: false,
        message: "No PRs associated with this commit",
      };
    }

    // Process each PR for fix comments
    let totalIngested = 0;

    const processPR = async (prNumber: number): Promise<void> => {
      const comments = await fetchAllPRComments(owner, repo, prNumber, installationId);

      if (comments.length === 0) {
        successLogger.debug("No comments found in PR", { prNumber });
        return;
      }

      const filesChanged = await fetchChangedFiles(owner, repo, prNumber, installationId);

      const failureContext = createFailureContext({
        checkRunId: check_run.id,
        checkName: check_run.name,
        errorSummary: extractErrorSummary(cachedFailure),
        failedAt: cachedFailure.analyzedAt,
        repository: repoFullName,
        prNumber,
        commitSha: check_run.head_sha,
        filesChanged,
      });

      const result = await ingestPRFixComments({
        comments,
        failureContext,
        tenantId: undefined,
      });

      totalIngested += result.ingested;

      successLogger.info("Processed PR for fix comments", {
        prNumber,
        commentsAnalyzed: comments.length,
        fixCommentsFound: result.fixCommentsFound,
        ingested: result.ingested,
      });
    };

    // Process PRs sequentially to avoid rate limiting
    const processPRsSequentially = async (index: number): Promise<void> => {
      if (index >= prs.length) {
        return;
      }
      await processPR(prs[index]);
      await processPRsSequentially(index + 1);
    };

    await processPRsSequentially(0);

    const errorSummary = extractErrorSummary(cachedFailure);

    successLogger.info("Completed fix knowledge capture for successful check", {
      repository: repoFullName,
      checkName: check_run.name,
      prsProcessed: prs.length,
      totalFixCommentsIngested: totalIngested,
    });

    return {
      handled: true,
      message:
        totalIngested > 0
          ? `Captured ${totalIngested} fix explanations`
          : "No fix explanations found in PR comments",
      fixCommentsIngested: totalIngested,
      previousFailure: {
        checkName: check_run.name,
        failedAt: cachedFailure.analyzedAt,
        errorSummary,
      },
    };
  } catch (error) {
    successLogger.error("Failed to process successful check run", {
      repository: repoFullName,
      checkName: check_run.name,
      error: getErrorMessage(error),
    });

    return {
      handled: false,
      message: `Error processing success: ${getErrorMessage(error)}`,
    };
  }
};
