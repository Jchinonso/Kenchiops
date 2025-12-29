/**
 * Pull request fetcher utilities.
 *
 * Fetches PR diff and metadata from GitHub API.
 * Dependency and build config change detection is handled by AI analysis.
 */

import {
  createLogger,
  GITHUB_CONTEXT_LIMITS,
  GITHUB_PAGINATION,
  getErrorMessage,
  getOrFetchPullRequest,
  getOrFetchPullRequestDiff,
} from "@kenchi/shared";
import { getOctokit } from "../githubService.js";
import { truncateWithContext } from "./logParser.js";
import type { PRMetadata } from "./types.js";

const logger = createLogger("github-app");

/**
 * Find PRs associated with a commit SHA.
 *
 * Uses GitHub API to find open pull requests that contain the specified commit.
 *
 * @param installationId - GitHub App installation ID
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param commitSha - The commit SHA to search for
 * @returns Array of PR numbers associated with the commit
 */
export const fetchPRsByCommit = async (
  installationId: number,
  owner: string,
  repo: string,
  commitSha: string
): Promise<number[]> => {
  try {
    const octokit = await getOctokit(installationId);

    // GitHub API: List pull requests associated with a commit
    const { data: prs } = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
      owner,
      repo,
      commit_sha: commitSha,
    });

    // Filter to only open PRs
    const openPRs = prs.filter((pr) => pr.state === "open");

    logger.info("Found PRs for commit", {
      commitSha: commitSha.substring(0, 7),
      totalPRs: prs.length,
      openPRs: openPRs.length,
    });

    return openPRs.map((pr) => pr.number);
  } catch (error) {
    logger.warn("Failed to find PRs for commit", {
      commitSha: commitSha.substring(0, 7),
      error: getErrorMessage(error),
    });
    return [];
  }
};

/**
 * Fetch PR diff with caching.
 *
 * Returns the full diff for AI analysis. AI will extract:
 * - Dependency changes (any package manager format)
 * - Build config changes (any language/toolchain)
 * - File modifications relevant to the failure
 *
 * @param installationId - GitHub App installation ID
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param prNumber - Pull request number
 * @returns PR diff (truncated) or null if unavailable
 */
export const fetchPRDiff = async (
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string | null> => {
  try {
    const diff = await getOrFetchPullRequestDiff(owner, repo, prNumber, async () => {
      const octokit = await getOctokit(installationId);

      const { data } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
        mediaType: {
          format: "diff",
        },
      });

      // The diff comes as a string when using mediaType diff format
      const diffContent = typeof data === "string" ? data : String(data);

      logger.info("Fetched PR diff from API", {
        prNumber,
        diffSize: diffContent.length,
      });

      return truncateWithContext(diffContent, GITHUB_CONTEXT_LIMITS.MAX_DIFF_SIZE);
    });

    return diff;
  } catch (error) {
    logger.warn("Failed to fetch PR diff", {
      prNumber,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Fetch PR metadata including reviews and labels with caching.
 *
 * Base PR data is cached, but reviews and comments are fetched fresh
 * since they change frequently.
 *
 * @param installationId - GitHub App installation ID
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param prNumber - Pull request number
 * @returns PR metadata or null if unavailable
 */
export const fetchPRMetadata = async (
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PRMetadata | null> => {
  try {
    const octokit = await getOctokit(installationId);

    // Fetch cached PR data and fresh reviews/comments in parallel
    const [cachedPR, reviewsResponse, commentsResponse] = await Promise.all([
      getOrFetchPullRequest(owner, repo, prNumber, async () => {
        const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
        return {
          number: pr.number,
          title: pr.title,
          body: pr.body,
          author: pr.user?.login || "unknown",
          headBranch: pr.head.ref,
          baseBranch: pr.base.ref,
          headSha: pr.head.sha,
          labels: pr.labels
            .map((label) => (typeof label === "string" ? label : label.name || ""))
            .filter(Boolean),
          state: pr.state,
          draft: pr.draft || false,
        };
      }),
      octokit.rest.pulls.listReviews({ owner, repo, pull_number: prNumber, per_page: 20 }),
      octokit.rest.issues.listComments({ owner, repo, issue_number: prNumber, per_page: 10 }),
    ]);

    const reviews = reviewsResponse.data;
    const comments = commentsResponse.data;

    // Determine review status
    const hasApproval = reviews.some((review) => review.state === "APPROVED");
    const hasChangesRequested = reviews.some((review) => review.state === "CHANGES_REQUESTED");
    const reviewStatus: PRMetadata["reviewStatus"] = hasChangesRequested
      ? "changes_requested"
      : hasApproval
        ? "approved"
        : reviews.length > 0
          ? "pending"
          : "review_required";

    // Extract unique reviewers
    const reviewers = [
      ...new Set(reviews.map((review) => review.user?.login).filter(Boolean)),
    ] as string[];

    // Extract recent comments (for context)
    const recentComments = comments.slice(-5).map((comment) => ({
      author: comment.user?.login || "unknown",
      body: comment.body?.slice(0, 500) || "",
      createdAt: comment.created_at,
    }));

    logger.info("Fetched PR metadata", {
      prNumber,
      reviewStatus,
      reviewerCount: reviewers.length,
      labelCount: cachedPR.labels.length,
    });

    return {
      number: cachedPR.number,
      title: cachedPR.title,
      description: cachedPR.body,
      author: cachedPR.author,
      baseBranch: cachedPR.baseBranch,
      headBranch: cachedPR.headBranch,
      labels: [...cachedPR.labels],
      isDraft: cachedPR.draft,
      reviewStatus,
      reviewers,
      comments: recentComments,
    };
  } catch (error) {
    logger.warn("Failed to fetch PR metadata", {
      prNumber,
      error: getErrorMessage(error),
    });
    return null;
  }
};

/**
 * Fetch list of changed files in a PR.
 *
 * Returns file paths for AI to analyze. AI will determine:
 * - Which are dependency files (any format)
 * - Which are build config files (any language)
 * - Which are source files relevant to the failure
 *
 * @param installationId - GitHub App installation ID
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param prNumber - Pull request number
 * @returns Array of changed file paths
 */
export const fetchChangedFiles = async (
  installationId: number,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string[]> => {
  try {
    const octokit = await getOctokit(installationId);

    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: GITHUB_PAGINATION.DEFAULT_PER_PAGE,
    });

    const filePaths = files.map((file) => file.filename);

    logger.info("Fetched changed files", {
      prNumber,
      fileCount: filePaths.length,
    });

    return filePaths;
  } catch (error) {
    logger.warn("Failed to fetch changed files", {
      prNumber,
      error: getErrorMessage(error),
    });
    return [];
  }
};
